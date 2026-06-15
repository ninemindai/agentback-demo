// Copyright ninemind.ai and LoopBack contributors. All Rights Reserved.
// Node module: weather-mcp-server
// This file is licensed under the MIT License.

// Ingests uploaded weather-observation CSVs and summarizes them. The raw CSV
// lives in the bound FileStore (the multipart parser streams it there under a
// server UUID); this service keeps a small in-memory index of id → {key,
// summary}. In production swap InMemoryFileStore → S3FileStore and the Map → a
// Drizzle `observations` table — the controller and MCP tool don't change.
import {randomUUID} from 'node:crypto';
import type {Readable} from 'node:stream';
import {injectable, BindingScope, ContextTags, inject} from '@agentback/core';
import {FILE_STORE, type FileStore} from '@agentback/files';
import type {UploadedFile} from '@agentback/openapi';
import {OBSERVATIONS_SERVICE} from './keys.js';
import {WeatherError} from './weather-service.js';
import type {ObservationSummaryT} from './schemas.js';

interface ObservationRow {
  date: string;
  tempC: number;
}

interface StoredObservations {
  key: string;
  filename: string;
  summary: ObservationSummaryT;
}

@injectable({
  scope: BindingScope.SINGLETON,
  tags: {[ContextTags.KEY]: OBSERVATIONS_SERVICE.key},
})
export class ObservationsService {
  private readonly index = new Map<string, StoredObservations>();

  constructor(@inject(FILE_STORE) private store: FileStore) {}

  /**
   * Ingest a multipart-uploaded CSV: parse + summarize, ensure the bytes are in
   * the FileStore, and index it under a new id. The parser has usually already
   * streamed the file to the store (`file.key`); if not (no store bound, memory
   * fallback) we store the buffer here.
   */
  async ingestUpload(file: UploadedFile): Promise<{
    id: string;
    filename: string;
    summary: ObservationSummaryT;
  }> {
    const bytes = file.buffer ?? (await this.readKey(file.key!));
    const summary = summarize(parseObservations(bytes.toString('utf8')));

    // The parser usually already streamed the file to the store (file.key).
    // If not (memory fallback, no store bound), store the buffer now.
    let key = file.key;
    if (!key) {
      const stored = await this.store.put(randomUUID(), bytes, {
        contentType: 'text/csv',
        filename: file.filename,
      });
      key = stored.key;
    }

    const id = randomUUID();
    this.index.set(id, {key, filename: file.filename, summary});
    return {id, filename: file.filename, summary};
  }

  /** Summary for a previously-uploaded file (by id). */
  summaryFor(id: string): ObservationSummaryT {
    return this.require(id).summary;
  }

  /** Summarize inline CSV text (no storage — the standalone MCP path). */
  summarizeCsv(csv: string): ObservationSummaryT {
    return summarize(parseObservations(csv));
  }

  /** A small CSV report (metric,value) for download. */
  report(id: string): {filename: string; csv: string} {
    const e = this.require(id);
    const s = e.summary;
    const csv =
      [
        'metric,value',
        `count,${s.count}`,
        `min_temp_c,${s.temperatureC.min}`,
        `max_temp_c,${s.temperatureC.max}`,
        `mean_temp_c,${s.temperatureC.mean}`,
        `date_from,${s.dateRange.from}`,
        `date_to,${s.dateRange.to}`,
      ].join('\n') + '\n';
    return {filename: `report-${e.filename}`, csv};
  }

  private require(id: string): StoredObservations {
    const e = this.index.get(id);
    if (!e) {
      throw new WeatherError(`No observations found for id "${id}".`, {
        status: 404,
        code: 'not_found',
        retryable: false,
      });
    }
    return e;
  }

  private async readKey(key: string): Promise<Buffer> {
    const got = await this.store.get(key);
    const chunks: Buffer[] = [];
    for await (const c of got.stream as Readable) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    }
    return Buffer.concat(chunks);
  }
}

/** Parse a `date,temp_c` CSV into rows, skipping blank/invalid lines. */
function parseObservations(csv: string): ObservationRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new WeatherError(
      'CSV has no data rows. Expected a header like `date,temp_c` and at ' +
        'least one row.',
    );
  }
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const dateIdx = header.indexOf('date');
  const tempIdx = header.findIndex(h =>
    ['temp_c', 'temperature_c', 'temp', 'temperature', 'temperature_2m'].includes(
      h,
    ),
  );
  if (dateIdx === -1 || tempIdx === -1) {
    throw new WeatherError(
      'CSV must have a `date` column and a temperature column ' +
        '(e.g. `temp_c`).',
    );
  }
  const rows: ObservationRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const date = cols[dateIdx]?.trim();
    const tempC = Number(cols[tempIdx]);
    if (!date || Number.isNaN(tempC)) continue; // skip malformed rows
    rows.push({date, tempC});
  }
  if (rows.length === 0) {
    throw new WeatherError('No valid observation rows found in the CSV.');
  }
  return rows;
}

function summarize(rows: ObservationRow[]): ObservationSummaryT {
  const temps = rows.map(r => r.tempC);
  const dates = rows.map(r => r.date).sort();
  const mean = temps.reduce((a, b) => a + b, 0) / temps.length;
  return {
    count: rows.length,
    temperatureC: {
      min: Math.min(...temps),
      max: Math.max(...temps),
      mean: Math.round(mean * 10) / 10,
    },
    dateRange: {from: dates[0], to: dates[dates.length - 1]},
  };
}
