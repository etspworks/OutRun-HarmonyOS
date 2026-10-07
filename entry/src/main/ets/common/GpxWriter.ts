/*
 * Rule-11 PORT of CoreGPX 0.8.1's WRITE path (plan port `port_coregpx`), from the vendored pod
 * source at input/source/OutRun-1.3/Pods/CoreGPX/Classes:
 *   - GPXElement.swift        -> tag/indent/addProperty machinery (incl. the CDATA rule)
 *   - NSMutableString+XML.swift -> appendOpenTag
 *   - GPXRoot.swift           -> GpxRoot, its namespace attributes, gpx(), outputToFile
 *   - GPXMetadata.swift       -> GpxMetadata
 *   - GPXTrack.swift / GPXTrackSegment.swift / GPXTrackPoint.swift / GPXWaypoint.swift
 *   - Converters.swift        -> isoDateString (the UTC "yyyy-MM-dd'T'HH:mm:ss'Z'" formatter)
 *
 * PORT SCOPE is the WRITE path only, which is all the app has: ShareManager.createGPXFile builds
 * root -> metadata(desc,time) -> track -> one segment per ACTIVE section -> a trkpt per route
 * sample (lat/lon/ele/time) and writes the file. The PARSER half of CoreGPX (GPXParser,
 * GPXRawElement, the `init(raw:)` initialisers, Codable conformance) is DELIBERATELY out of scope:
 * the app never reads a GPX file, only writes one.
 * Also out of scope for the same reason: routes (`GPXRoute`/`GPXRoutePoint`), standalone waypoints,
 * `GPXExtensions`, `GPXLink`/`GPXAuthor`/`GPXCopyright`/`GPXBounds`/`GPXFix`, and every DGPS and
 * dilution field — no call site sets any of them, and the elements are optional in GPX 1.1 so the
 * output stays schema-valid without them.
 *
 * The byte-level details are kept so the output matches the source's file exactly: CRLF line ends,
 * tab indentation one level per nesting depth, the XML declaration before the <gpx> tag, and the
 * CDATA wrap for any value holding a character outside CoreGPX's allowed set.
 */
import { fileIo as fs } from '@kit.CoreFileKit';

const SCHEMA: string = 'http://www.topografix.com/GPX/1/1';
const SCHEMA_LOCATION: string =
  'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd';
const XSI: string = 'http://www.w3.org/2001/XMLSchema-instance';
/** Source: `GPXRoot.version` — only GPX 1.1 is generated. */
const VERSION: string = '1.1';
/** Source: `GPXElement.addProperty` — anything outside this set is wrapped in CDATA. */
const PLAIN_VALUE: RegExp = /[^a-zA-Z0-9.,+\-\/*!='"()\[\]{}!$%@?_;: #\t\r\n]/;

/** Source: `GPXElement.indent(forIndentationLevel:)`. */
function indent(level: number): string {
  let result: string = '';
  for (let i: number = 0; i < level; i++) {
    result += '\t';
  }
  return result;
}

/** Source: `Convert.toString(from:)` — ISO8601 in UTC, "yyyy-MM-ddTHH:mm:ssZ". */
export function isoDateString(date: Date): string {
  return date.toISOString().substring(0, 19) + 'Z';
}

/** Source: `GPXElement.addProperty(forValue:...)`, including the empty/default skip and CDATA. */
function addProperty(lines: string[], tagName: string, value: string | null, level: number): void {
  if (value === null || value === '') {
    return;
  }
  if (PLAIN_VALUE.test(value)) {
    const escaped: string = value.split(']]>').join(']]&gt;');
    lines.push(`${indent(level)}<${tagName}><![CDATA[${escaped}]]></${tagName}>\r\n`);
    return;
  }
  lines.push(`${indent(level)}<${tagName}>${value}</${tagName}>\r\n`);
}

/** Source: `GPXElement.addProperty(forDoubleValue:...)`. */
function addDoubleProperty(lines: string[], tagName: string, value: number | null, level: number): void {
  if (value === null) {
    return;
  }
  addProperty(lines, tagName, `${value}`, level);
}

/** Source: `GPXMetadata` — the app sets `desc` and `time`. */
export class GpxMetadata {
  name: string | null = null;
  desc: string | null = null;
  time: Date | null = null;
  keywords: string | null = null;

  /** Source: `GPXMetadata.addChildTag` wrapped in `GPXElement.gpx(_:indentationLevel:)`. */
  appendTo(lines: string[], level: number): void {
    lines.push(`${indent(level)}<metadata>\r\n`);
    addProperty(lines, 'name', this.name, level + 1);
    addProperty(lines, 'desc', this.desc, level + 1);
    addProperty(lines, 'time', this.time !== null ? isoDateString(this.time) : null, level + 1);
    addProperty(lines, 'keywords', this.keywords, level + 1);
    lines.push(`${indent(level)}</metadata>\r\n`);
  }
}

/**
 * Source: `GPXTrackPoint` — a `GPXWaypoint` under the `trkpt` tag. Only the four fields the app
 * sets are carried (see the port-scope note above); lat/lon are tag ATTRIBUTES, the rest children.
 */
export class GpxTrackPoint {
  latitude: number | null = null;
  longitude: number | null = null;
  elevation: number | null = null;
  time: Date | null = null;

  constructor(latitude: number | null = null, longitude: number | null = null) {
    this.latitude = latitude;
    this.longitude = longitude;
  }

  /** Source: `GPXWaypoint.addOpenTag` + `addChildTag`, with `GPXTrackPoint.tagName()` = "trkpt". */
  appendTo(lines: string[], level: number): void {
    let attribute: string = '';
    if (this.latitude !== null) {
      attribute += ` lat="${this.latitude}"`;
    }
    if (this.longitude !== null) {
      attribute += ` lon="${this.longitude}"`;
    }
    lines.push(`${indent(level)}<trkpt${attribute}>\r\n`);
    addDoubleProperty(lines, 'ele', this.elevation, level + 1);
    addProperty(lines, 'time', this.time !== null ? isoDateString(this.time) : null, level + 1);
    lines.push(`${indent(level)}</trkpt>\r\n`);
  }
}

/** Source: `GPXTrackSegment`. */
export class GpxTrackSegment {
  trackpoints: GpxTrackPoint[] = [];

  /** Source: `add(trackpoint:)`. */
  add(trackpoint: GpxTrackPoint | null): void {
    if (trackpoint !== null) {
      this.trackpoints.push(trackpoint);
    }
  }

  appendTo(lines: string[], level: number): void {
    lines.push(`${indent(level)}<trkseg>\r\n`);
    for (const trackpoint of this.trackpoints) {
      trackpoint.appendTo(lines, level + 1);
    }
    lines.push(`${indent(level)}</trkseg>\r\n`);
  }
}

/** Source: `GPXTrack`. */
export class GpxTrack {
  name: string | null = null;
  comment: string | null = null;
  desc: string | null = null;
  source: string | null = null;
  number: number | null = null;
  type: string | null = null;
  tracksegments: GpxTrackSegment[] = [];

  /** Source: `add(trackSegment:)`. */
  add(trackSegment: GpxTrackSegment | null): void {
    if (trackSegment !== null) {
      this.tracksegments.push(trackSegment);
    }
  }

  /** Source: `GPXTrack.addChildTag` — the metadata children first, then the segments. */
  appendTo(lines: string[], level: number): void {
    lines.push(`${indent(level)}<trk>\r\n`);
    addProperty(lines, 'name', this.name, level + 1);
    addProperty(lines, 'cmt', this.comment, level + 1);
    addProperty(lines, 'desc', this.desc, level + 1);
    addProperty(lines, 'src', this.source, level + 1);
    if (this.number !== null) {
      addProperty(lines, 'number', `${Math.trunc(this.number)}`, level + 1);
    }
    addProperty(lines, 'type', this.type, level + 1);
    for (const segment of this.tracksegments) {
      segment.appendTo(lines, level + 1);
    }
    lines.push(`${indent(level)}</trk>\r\n`);
  }
}

/** Source: `GPXRoot`. */
export class GpxRoot {
  readonly version: string = VERSION;
  creator: string;
  metadata: GpxMetadata | null = null;
  tracks: GpxTrack[] = [];

  /** Source: `init(creator:)`, and `init()`'s default creator when none is given. */
  constructor(creator: string = 'Powered by Open Source CoreGPX Project') {
    this.creator = creator;
  }

  /** Source: `add(track:)`. */
  add(track: GpxTrack | null): void {
    if (track !== null) {
      this.tracks.push(track);
    }
  }

  /** Source: `GPXElement.gpx()` via `GPXRoot.addOpenTag`/`addChildTag`. */
  gpx(): string {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>\r\n');
    lines.push(`<gpx xmlns:xsi="${XSI}" xmlns="${SCHEMA}" xsi:schemaLocation="${SCHEMA_LOCATION}"` +
      ` version="${this.version}" creator="${this.creator}">\r\n`);
    if (this.metadata !== null) {
      this.metadata.appendTo(lines, 1);
    }
    for (const track of this.tracks) {
      track.appendTo(lines, 1);
    }
    lines.push('</gpx>\r\n');
    return lines.join('');
  }

  /**
   * Source: `outputToFile(saveAt:fileName:)`. The source read the temporary directory off
   * `FileManager.default`; here the caller passes the sandbox directory it already holds
   * (`context.tempDir`), because only the ability can resolve it. Returns the full path it wrote,
   * which is what the share sheet needs; throws on failure, as the source does.
   */
  outputToFile(directoryPath: string, fileName: string): string {
    const filePath: string = `${directoryPath}/${fileName}.gpx`;
    const file: fs.File = fs.openSync(filePath,
      fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try {
      fs.writeSync(file.fd, this.gpx());
    } finally {
      fs.closeSync(file);
    }
    return filePath;
  }
}
