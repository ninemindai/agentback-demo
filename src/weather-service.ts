// Open-Meteo client: geocoding + current/forecast weather.
// No API key required — https://open-meteo.com.
import {injectable, BindingScope, ContextTags} from '@agentback/core';
import {WEATHER_SERVICE} from './keys.js';
import type {
  CurrentWeatherInputT,
  CurrentWeatherOutputT,
  ForecastInputT,
  ForecastOutputT,
  GeocodeOutputT,
  ResolvedLocationT,
} from './schemas.js';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** WMO weather interpretation codes → human-readable text. */
const WMO_CODE: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

function describeCode(code: number): string {
  return WMO_CODE[code] ?? `Unknown (WMO ${code})`;
}

/**
 * A self-describing error whose message is safe to surface to the calling
 * agent. It carries the `statusCode`/`code`/`publicMessage`/`retryable` fields
 * the framework's error envelope reads (the same shape as
 * `@agentback/openapi`'s `AgentError`) — without them a thrown error is
 * redacted to a generic `internal_error` 500 on both REST and MCP, and the
 * message never reaches the caller. Defaults to a 400 client error; pass
 * `{status, code}` for upstream (Open-Meteo) failures.
 */
export class WeatherError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly publicMessage: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {status?: number; code?: string; retryable?: boolean} = {},
  ) {
    super(message);
    this.name = 'WeatherError';
    this.statusCode = options.status ?? 400;
    this.code = options.code ?? 'invalid_input';
    this.publicMessage = message;
    this.retryable = options.retryable ?? true;
  }
}

async function getJson<T>(url: string, params: Record<string, string | number>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const full = `${url}?${qs.toString()}`;

  let res: Response;
  try {
    res = await fetch(full, {signal: AbortSignal.timeout(15_000)});
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new WeatherError(
      `Open-Meteo request failed: ${reason}. Please try again.`,
      {status: 502, code: 'upstream_error'},
    );
  }
  if (!res.ok) {
    throw new WeatherError(
      `Open-Meteo returned HTTP ${res.status} ${res.statusText} for ${url.split('/').pop()}.`,
      {status: 502, code: 'upstream_error'},
    );
  }
  return (await res.json()) as T;
}

/**
 * Stateless weather service. `@injectable` declares its own binding: the
 * `WEATHER_SERVICE` key (`services.weather`) and singleton scope — it's pure
 * I/O with no per-request state, so one shared instance is reused. The
 * `WeatherComponent` registers it via its `services` array, which reads this
 * metadata.
 */
@injectable({
  scope: BindingScope.SINGLETON,
  tags: {[ContextTags.KEY]: WEATHER_SERVICE.key},
})
export class WeatherService {
  /** Search a free-text place name and return ranked coordinate candidates. */
  async geocode(query: string, count: number): Promise<GeocodeOutputT> {
    const data = await getJson<{results?: RawGeocode[]}>(GEOCODE_URL, {
      name: query,
      count,
      language: 'en',
      format: 'json',
    });
    const matches = (data.results ?? []).map(r => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      admin1: r.admin1,
      timezone: r.timezone,
      population: r.population,
    }));
    return {query, matches};
  }

  /**
   * Resolve a location selector (`city` OR `latitude`+`longitude`) to concrete
   * coordinates, geocoding the city name when needed.
   */
  private async resolveLocation(sel: {
    city?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<ResolvedLocationT> {
    const hasCoords = sel.latitude !== undefined && sel.longitude !== undefined;
    if (hasCoords) {
      return {
        name: `${sel.latitude},${sel.longitude}`,
        latitude: sel.latitude!,
        longitude: sel.longitude!,
        timezone: 'auto',
      };
    }
    if (sel.city) {
      const {matches} = await this.geocode(sel.city, 1);
      const top = matches[0];
      if (!top) {
        throw new WeatherError(
          `No location found for "${sel.city}". Try a more specific name, ` +
            `or pass latitude and longitude directly.`,
        );
      }
      const label = [top.name, top.admin1, top.country].filter(Boolean).join(', ');
      return {
        name: label,
        latitude: top.latitude,
        longitude: top.longitude,
        timezone: top.timezone ?? 'auto',
      };
    }
    throw new WeatherError(
      'Provide either a "city" name or both "latitude" and "longitude".',
    );
  }

  async current(input: CurrentWeatherInputT): Promise<CurrentWeatherOutputT> {
    const loc = await this.resolveLocation(input);
    const data = await getJson<RawForecast>(FORECAST_URL, {
      latitude: loc.latitude,
      longitude: loc.longitude,
      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,' +
        'precipitation,weather_code,wind_speed_10m,wind_direction_10m',
      timezone: 'auto',
      temperature_unit: input.temperature_unit,
      wind_speed_unit: input.wind_speed_unit,
    });
    const c = data.current;
    if (!c)
      throw new WeatherError('Open-Meteo returned no current observation.', {
        status: 502,
        code: 'upstream_error',
      });
    return {
      location: {...loc, timezone: data.timezone ?? loc.timezone},
      observed_at: c.time,
      condition: describeCode(c.weather_code),
      weather_code: c.weather_code,
      is_day: c.is_day === 1,
      temperature: c.temperature_2m,
      apparent_temperature: c.apparent_temperature,
      relative_humidity: c.relative_humidity_2m,
      precipitation: c.precipitation,
      wind_speed: c.wind_speed_10m,
      wind_direction: c.wind_direction_10m,
      temperature_unit: data.current_units?.temperature_2m ?? input.temperature_unit,
      wind_speed_unit: data.current_units?.wind_speed_10m ?? input.wind_speed_unit,
    };
  }

  async forecast(input: ForecastInputT): Promise<ForecastOutputT> {
    const loc = await this.resolveLocation(input);
    const data = await getJson<RawForecast>(FORECAST_URL, {
      latitude: loc.latitude,
      longitude: loc.longitude,
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,' +
        'precipitation_probability_max,wind_speed_10m_max',
      forecast_days: input.days,
      timezone: 'auto',
      temperature_unit: input.temperature_unit,
      wind_speed_unit: input.wind_speed_unit,
    });
    const d = data.daily;
    if (!d)
      throw new WeatherError('Open-Meteo returned no forecast data.', {
        status: 502,
        code: 'upstream_error',
      });
    const days = d.time.map((date, i) => ({
      date,
      condition: describeCode(d.weather_code[i]),
      weather_code: d.weather_code[i],
      temperature_max: d.temperature_2m_max[i],
      temperature_min: d.temperature_2m_min[i],
      precipitation_sum: d.precipitation_sum[i],
      precipitation_probability_max: d.precipitation_probability_max?.[i] ?? null,
      wind_speed_max: d.wind_speed_10m_max[i],
    }));
    return {
      location: {...loc, timezone: data.timezone ?? loc.timezone},
      temperature_unit: data.daily_units?.temperature_2m_max ?? input.temperature_unit,
      wind_speed_unit: data.daily_units?.wind_speed_10m_max ?? input.wind_speed_unit,
      days,
    };
  }
}

// ---- Raw Open-Meteo response shapes (only the fields we read) ----
interface RawGeocode {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
  population?: number;
}

interface RawForecast {
  timezone?: string;
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
  current_units?: {temperature_2m?: string; wind_speed_10m?: string};
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max?: (number | null)[];
    wind_speed_10m_max: number[];
  };
  daily_units?: {temperature_2m_max?: string; wind_speed_10m_max?: string};
}
