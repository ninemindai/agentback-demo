// Copyright ninemind.ai and LoopBack contributors. All Rights Reserved.
// Node module: weather-mcp-server
// This file is licensed under the MIT License.

import {z} from 'zod';
import {inject} from '@agentback/core';
import {mcpServer, tool} from '@agentback/mcp';
import type {ObservationsService} from '../observations-service.js';
import {OBSERVATIONS_SERVICE} from '../keys.js';
import {WeatherError} from '../weather-service.js';
import {
  SummarizeObservationsInput,
  SummarizeObservationsOutput,
} from '../schemas.js';

/**
 * MCP surface over uploaded observations. The dual-surface payoff: a CSV
 * uploaded over REST (`POST /observations`) is summarized here by the agent —
 * same `ObservationsService`, same `FileStore`, one container. Also accepts
 * inline `csv` so the tool is useful over stdio with no prior upload.
 */
@mcpServer()
export class ObservationsTools {
  constructor(
    @inject(OBSERVATIONS_SERVICE) private observations: ObservationsService,
  ) {}

  @tool('summarize_observations', {
    title: 'Summarize weather observations',
    description:
      'Compute summary stats (count, min/max/mean temperature, date range) for ' +
      'a set of weather observations. Provide EITHER an "observationsId" from a ' +
      'prior POST /observations upload, OR inline "csv" text with a `date` ' +
      'column and a temperature column.',
    input: SummarizeObservationsInput,
    output: SummarizeObservationsOutput,
  })
  async summarizeObservations(
    input: z.infer<typeof SummarizeObservationsInput>,
  ): Promise<z.infer<typeof SummarizeObservationsOutput>> {
    if (input.observationsId && input.csv) {
      throw new WeatherError(
        'Provide either "observationsId" or "csv", not both.',
      );
    }
    if (input.csv) {
      return {observationsId: null, summary: this.observations.summarizeCsv(input.csv)};
    }
    if (input.observationsId) {
      return {
        observationsId: input.observationsId,
        summary: this.observations.summaryFor(input.observationsId),
      };
    }
    throw new WeatherError(
      'Provide an "observationsId" (from POST /observations) or inline "csv".',
    );
  }
}
