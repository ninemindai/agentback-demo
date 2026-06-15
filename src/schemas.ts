// Copyright ninemind.ai and LoopBack contributors. All Rights Reserved.
// Node module: weather-mcp-server
// This file is licensed under the MIT License.

import {z} from 'zod';

/**
 * Shared Zod schemas — the single source of truth for this server.
 *
 * Each schema simultaneously serves as the runtime validator, the inferred
 * TypeScript type (`z.infer`), and the MCP `inputSchema`/`outputSchema` the
 * calling agent inspects. Edit a schema here and every contract changes.
 */

// ---------------------------------------------------------------------------
// Location selection
// ---------------------------------------------------------------------------

/**
 * A location can be specified either by free-text place name OR by explicit
 * coordinates. Kept as a plain object (no `.refine`) so it stays a `ZodObject`
 * the MCP decorator can turn into JSON Schema; the "one of" rule is enforced in
 * the service with an actionable error message.
 */
const LocationSelector = {
  city: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe(
      'Place name to geocode, e.g. "Tokyo", "Paris, France", "Austin TX". ' +
        'Provide this OR latitude+longitude.',
    ),
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .optional()
    .describe('Latitude in decimal degrees. Provide with longitude to skip geocoding.'),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .optional()
    .describe('Longitude in decimal degrees. Provide with latitude to skip geocoding.'),
};

export const TemperatureUnit = z
  .enum(['celsius', 'fahrenheit'])
  .default('celsius')
  .describe('Unit for temperature values.');

export const WindSpeedUnit = z
  .enum(['kmh', 'ms', 'mph', 'kn'])
  .default('kmh')
  .describe('Unit for wind speed (km/h, m/s, mph, knots).');

// ---------------------------------------------------------------------------
// geocode_location
// ---------------------------------------------------------------------------

export const GeocodeInput = z
  .object({
    query: z
      .string()
      .min(1)
      .max(120)
      .describe('Place name to search for, e.g. "Springfield".'),
    count: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe('Maximum number of candidate matches to return (1-10).'),
  })
  .strict();

export const GeocodeMatch = z.object({
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  admin1: z.string().optional().describe('State / region, when available.'),
  timezone: z.string().optional(),
  population: z.number().optional(),
});

export const GeocodeOutput = z.object({
  query: z.string(),
  matches: z.array(GeocodeMatch),
});

// ---------------------------------------------------------------------------
// get_current_weather
// ---------------------------------------------------------------------------

export const CurrentWeatherInput = z
  .object({
    ...LocationSelector,
    temperature_unit: TemperatureUnit,
    wind_speed_unit: WindSpeedUnit,
  })
  .strict();

export const ResolvedLocation = z.object({
  name: z.string().describe('Resolved location label (geocoded name or "lat,lon").'),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
});

export const CurrentWeatherOutput = z.object({
  location: ResolvedLocation,
  observed_at: z.string().describe('ISO-8601 timestamp of the observation (local time).'),
  condition: z.string().describe('Human-readable weather description (from WMO code).'),
  weather_code: z.number().int(),
  is_day: z.boolean(),
  temperature: z.number(),
  apparent_temperature: z.number().describe('"Feels like" temperature.'),
  relative_humidity: z.number().describe('Percent, 0-100.'),
  precipitation: z.number(),
  wind_speed: z.number(),
  wind_direction: z.number().describe('Degrees, meteorological (0 = from North).'),
  temperature_unit: z.string(),
  wind_speed_unit: z.string(),
});

// ---------------------------------------------------------------------------
// get_forecast
// ---------------------------------------------------------------------------

export const ForecastInput = z
  .object({
    ...LocationSelector,
    days: z
      .number()
      .int()
      .min(1)
      .max(16)
      .default(7)
      .describe('Number of forecast days (1-16).'),
    temperature_unit: TemperatureUnit,
    wind_speed_unit: WindSpeedUnit,
  })
  .strict();

export const ForecastDay = z.object({
  date: z.string().describe('Calendar date, YYYY-MM-DD.'),
  condition: z.string(),
  weather_code: z.number().int(),
  temperature_max: z.number(),
  temperature_min: z.number(),
  precipitation_sum: z.number(),
  precipitation_probability_max: z
    .number()
    .nullable()
    .describe('Peak precipitation probability for the day, percent (may be null).'),
  wind_speed_max: z.number(),
});

export const ForecastOutput = z.object({
  location: ResolvedLocation,
  temperature_unit: z.string(),
  wind_speed_unit: z.string(),
  days: z.array(ForecastDay),
});

// Inferred types for handlers / service layer.
export type GeocodeInputT = z.infer<typeof GeocodeInput>;
export type GeocodeOutputT = z.infer<typeof GeocodeOutput>;
export type CurrentWeatherInputT = z.infer<typeof CurrentWeatherInput>;
export type CurrentWeatherOutputT = z.infer<typeof CurrentWeatherOutput>;
export type ForecastInputT = z.infer<typeof ForecastInput>;
export type ForecastOutputT = z.infer<typeof ForecastOutput>;
export type ResolvedLocationT = z.infer<typeof ResolvedLocation>;

// ---------------------------------------------------------------------------
// Observations (CSV upload + summary)
// ---------------------------------------------------------------------------

/** Summary statistics computed from an uploaded observations CSV. */
export const ObservationSummary = z
  .object({
    count: z.number().int().describe('Number of valid rows parsed.'),
    temperatureC: z
      .object({
        min: z.number().describe('Lowest temperature (°C).'),
        max: z.number().describe('Highest temperature (°C).'),
        mean: z.number().describe('Mean temperature (°C), rounded to 0.1.'),
      })
      .describe('Temperature statistics in degrees Celsius.'),
    dateRange: z
      .object({
        from: z.string().describe('Earliest observation date.'),
        to: z.string().describe('Latest observation date.'),
      })
      .describe('Date span covered by the observations.'),
  })
  .describe('Summary statistics for a set of weather observations.');
export type ObservationSummaryT = z.infer<typeof ObservationSummary>;

/** Result of POST /observations (CSV upload). */
export const ObservationUploadResult = z.object({
  id: z.string().describe('Identifier — pass to summarize_observations or the report route.'),
  filename: z.string(),
  summary: ObservationSummary,
});
export type ObservationUploadResultT = z.infer<typeof ObservationUploadResult>;

/**
 * Input for `summarize_observations`. Supply EITHER `observationsId` (from a
 * prior POST /observations upload) OR inline `csv` text. Kept a plain
 * `ZodObject` (no `.refine`) so the MCP decorator can emit JSON Schema; the
 * "one of" rule is enforced in the tool with an actionable error.
 */
export const SummarizeObservationsInput = z
  .object({
    observationsId: z
      .string()
      .min(1)
      .optional()
      .describe('Id returned by POST /observations. Provide this OR `csv`.'),
    csv: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Inline CSV text with a `date` column and a temperature column ' +
          '(e.g. `temp_c`). Provide this OR `observationsId`.',
      ),
  })
  .describe('Summarize uploaded observations by id, or inline CSV text.');
export type SummarizeObservationsInputT = z.infer<
  typeof SummarizeObservationsInput
>;

export const SummarizeObservationsOutput = z.object({
  observationsId: z
    .string()
    .nullable()
    .describe('The source id, or null when summarizing inline csv.'),
  summary: ObservationSummary,
});
export type SummarizeObservationsOutputT = z.infer<
  typeof SummarizeObservationsOutput
>;
