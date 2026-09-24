/**
 * Plain-language explanations for technical terms, shown in context by <Term>. They restate, never change, the
 * scientific meaning: "ruled out" is incompatible under stated assumptions (not clean); "retained" is worth
 * checking (not responsible).
 */
export const GLOSSARY = {
  station: "a fixed, named place on the stream where readings can be taken and compared over time.",
  reach: "a stretch of stream between two junctions or stations; the unit the analysis rules in or out.",
  background: "the range of values the protocol expects from upstream water before anything is added; readings are compared against it.",
  sc25: "conductivity adjusted to 25 °C, so readings taken at different water temperatures can be compared.",
  ruledOut: "under the stated assumptions and the accepted readings, no possible source on this stretch fits. It is not a finding that the water is fine.",
  retained: "a possible source on this stretch still fits the evidence, so it stays worth checking. It does not mean the problem comes from here.",
  unresolved: "the analysis could not decide in time or with the data it has, so the stretch stays under consideration.",
  readiness: "the checks that must pass before the analysis may rule any stretch out; until then nothing is excluded.",
  networkVersion: "a reviewed, numbered copy of the local stream map; every assessment records which version it used.",
  candidate: "a stretch still under consideration: it has not been ruled out.",
  replicate: "a repeated measurement at the same place and time, recorded separately so variation stays visible.",
  qualification: "training recorded for a person and valid on the day of the measurement.",
} as const;

export type TermKey = keyof typeof GLOSSARY;
