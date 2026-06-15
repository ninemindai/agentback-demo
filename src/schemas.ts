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
