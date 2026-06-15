// Copyright ninemind.ai and LoopBack contributors. All Rights Reserved.
// Node module: weather-mcp-server
// This file is licensed under the MIT License.

// REST surface over the same WeatherService the MCP tools use — so a browser
// (which can't speak MCP directly) can fetch forecasts. Query params are
// coerced (everything arrives as a string on a GET); responses reuse the MCP
// output schemas, so /openapi.json documents them identically.
import {z} from 'zod';
import {inject} from '@agentback/core';
import {api, get} from '@agentback/openapi';
import type {WeatherService} from './weather-service.js';
import {WEATHER_SERVICE} from './keys.js';
import {
  CurrentWeatherOutput,
  ForecastOutput,
  GeocodeOutput,
  TemperatureUnit,
  WindSpeedUnit,
} from './schemas.js';

// A location is a city name OR coordinates; numbers/days are coerced from the
// query string. (The MCP tools take JSON, so they use plain z.number().)
const LocationQuery = {
  city: z.string().min(1).max(120).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  temperature_unit: TemperatureUnit,
  wind_speed_unit: WindSpeedUnit,
};

const CurrentQuery = z.object({...LocationQuery});
const ForecastQuery = z.object({
  ...LocationQuery,
  days: z.coerce.number().int().min(1).max(16).default(7),
});
const GeocodeQuery = z.object({
  query: z.string().min(1).max(120),
  count: z.coerce.number().int().min(1).max(10).default(5),
});

@api({basePath: '/weather', tags: ['weather']})
export class WeatherController {
  constructor(@inject(WEATHER_SERVICE) private weather: WeatherService) {}

  @get('/geocode', {query: GeocodeQuery, response: GeocodeOutput})
  async geocode(input: {query: z.infer<typeof GeocodeQuery>}) {
    return this.weather.geocode(input.query.query, input.query.count);
  }

  @get('/current', {query: CurrentQuery, response: CurrentWeatherOutput})
  async current(input: {query: z.infer<typeof CurrentQuery>}) {
    return this.weather.current(input.query);
  }

  @get('/forecast', {query: ForecastQuery, response: ForecastOutput})
  async forecast(input: {query: z.infer<typeof ForecastQuery>}) {
    return this.weather.forecast(input.query);
  }
}
