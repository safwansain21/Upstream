/**
 * One sentence per readiness check (labels from the API's READINESS_CHECKS): what is missing, and which role can fix it.
 * The API's own reason text is still shown underneath, word for word.
 */
export const READINESS_HELP: Record<string, { missing: string; role: string }> = {
  "Local network mapped and reviewed": { missing: "There is no reviewed local stream map yet.", role: "A coordinator or network verifier imports the linework and publishes a reviewed version." },
  "Connectivity and flow direction verified": { missing: "Some stretches have unconfirmed connections or flow direction.", role: "A network verifier checks them on the Local map tab." },
  "Supported flow regime": { missing: "This stream’s flow (for example tidal or looped) is outside what the analysis supports.", role: "An expert decides how the investigation proceeds without it." },
  "Boundary inflow treatment evidenced": { missing: "Water entering at the upstream edge of the map is not yet accounted for.", role: "A network verifier records how that boundary is treated, with evidence." },
  "Station positions approved": { missing: "A station’s position has not been approved.", role: "A network verifier approves station positions on the Local map tab." },
  "Accepted measurements": { missing: "No readings have passed quality review yet.", role: "A qualified monitor collects readings; an expert reviews them." },
  "Background ranges for measured stations": { missing: "A measured station has no background range to compare against.", role: "An expert records the expected upstream range for that station." },
  "Instrument calibration and uncertainty": { missing: "An instrument’s calibration or uncertainty is missing for a reading.", role: "An expert records a verification event under Instruments." },
  "Transport intervals": { missing: "Travel time between stations has not been recorded.", role: "An expert adds travel-time bounds for this network." },
  "Anchor and persistence": { missing: "The change has not yet been confirmed as sustained at an anchor station.", role: "A monitor takes a repeat reading at the anchor; an expert reviews it." },
  "Comparability of readings": { missing: "Readings are waiting for a comparability decision.", role: "An expert marks them comparable, or not, in quality review." },
  "Other prerequisites": { missing: "Another prerequisite is missing.", role: "A coordinator or expert reviews the detail below." },
};
