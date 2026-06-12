import {BindingKey} from '@agentback/core';
import type {WeatherService} from './weather-service.js';

/**
 * Typed DI keys for the weather feature. Bind and `@inject` through these
 * constants instead of raw strings — the key carries the bound value's type to
 * both the producer (the component's binding) and the consumer (the tool).
 */
export const WEATHER_SERVICE = BindingKey.create<WeatherService>(
  'services.weather',
);
