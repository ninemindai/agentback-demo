import {z} from 'zod';
import {inject} from '@agentback/core';
import {mcpServer, tool} from '@agentback/mcp';
import type {WeatherService} from '../weather-service.js';
import {WEATHER_SERVICE} from '../keys.js';
import {
  CurrentWeatherInput,
  CurrentWeatherOutput,
  ForecastInput,
  ForecastOutput,
  GeocodeInput,
  GeocodeOutput,
} from '../schemas.js';

/**
 * Weather tool surface. `@mcpServer()` tags the class so the MCP server
 * discovers it at startup; `WeatherService` is injected via the typed
 * `WEATHER_SERVICE` key (see `keys.ts`).
 *
 * Each `@tool` carries its Zod input/output schemas directly — the same schema
 * is the validator, the agent-visible `inputSchema`, and the runtime output check.
 */
@mcpServer()
export class WeatherTools {
  constructor(@inject(WEATHER_SERVICE) private weather: WeatherService) {}

  @tool('geocode_location', {
    title: 'Geocode a place name',
    description:
      'Resolve a free-text place name (e.g. "Tokyo", "Springfield, Illinois") ' +
      'to candidate latitude/longitude coordinates. Use this first when a user ' +
      'names an ambiguous place, then pass the chosen coordinates to the weather tools.',
    input: GeocodeInput,
    output: GeocodeOutput,
  })
  async geocodeLocation(input: z.infer<typeof GeocodeInput>) {
    return this.weather.geocode(input.query, input.count);
  }

  @tool('get_current_weather', {
    title: 'Current weather',
    description:
      'Get current weather conditions for a location. Specify EITHER a "city" ' +
      'name (it will be geocoded automatically) OR explicit "latitude" and ' +
      '"longitude". Returns temperature, "feels like", humidity, precipitation, ' +
      'wind, and a human-readable condition.',
    input: CurrentWeatherInput,
    output: CurrentWeatherOutput,
  })
  async getCurrentWeather(input: z.infer<typeof CurrentWeatherInput>) {
    return this.weather.current(input);
  }

  @tool('get_forecast', {
    title: 'Daily forecast',
    description:
      'Get a daily weather forecast (1-16 days) for a location. Specify EITHER ' +
      'a "city" name OR "latitude"+"longitude". Returns per-day high/low ' +
      'temperatures, precipitation total and probability, peak wind, and condition.',
    input: ForecastInput,
    output: ForecastOutput,
  })
  async getForecast(input: z.infer<typeof ForecastInput>) {
    return this.weather.forecast(input);
  }
}
