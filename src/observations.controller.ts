// Copyright ninemind.ai and LoopBack contributors. All Rights Reserved.
// Node module: weather-mcp-server
// This file is licensed under the MIT License.

import {z} from 'zod';
import {inject} from '@agentback/core';
import {api, get, post, fileField} from '@agentback/openapi';
import {fileResponse} from '@agentback/rest';
import type {ObservationsService} from './observations-service.js';
import {OBSERVATIONS_SERVICE} from './keys.js';
import {ObservationUploadResult} from './schemas.js';

// The multipart body: one CSV file. The `fileField()` flips the route to
// multipart/form-data (file → format:binary in /openapi.json), streams the
// upload to the bound FileStore under a server UUID, and rejects oversize/
// wrong-type files before storing.
const UploadBody = z.object({
  file: fileField({
    maxSize: 2_000_000,
    mimeTypes: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
    description: 'A CSV with a `date` column and a temperature column.',
  }),
});

const ReportPath = z.object({id: z.string().min(1)});

/**
 * REST surface for observations. The upload route ingests a CSV; the report
 * route streams a summary back out (`fileResponse`). The same uploaded file is
 * also reachable from the `summarize_observations` MCP tool — one container,
 * two surfaces, one `ObservationsService` + `FileStore`.
 */
@api({basePath: '/observations', tags: ['observations']})
export class ObservationsController {
  constructor(
    @inject(OBSERVATIONS_SERVICE) private observations: ObservationsService,
  ) {}

  @post('/', {body: UploadBody, response: ObservationUploadResult, status: 201})
  async upload(input: {
    body: z.infer<typeof UploadBody>;
  }): Promise<z.infer<typeof ObservationUploadResult>> {
    return this.observations.ingestUpload(input.body.file);
  }

  @get('/{id}/report', {path: ReportPath})
  async report(input: {path: z.infer<typeof ReportPath>}) {
    const {filename, csv} = this.observations.report(input.path.id);
    return fileResponse(Buffer.from(csv, 'utf8'), {
      contentType: 'text/csv',
      filename,
      disposition: 'attachment',
    });
  }
}
