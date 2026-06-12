import {Application as CoreApplication} from '@agentback/core';
import {registerWeatherMcp} from './wiring.js';

export class Application extends CoreApplication {
  constructor(options: {stdio?: boolean} = {}) {
    super();
    registerWeatherMcp(this, options.stdio ?? true);
  }
}
