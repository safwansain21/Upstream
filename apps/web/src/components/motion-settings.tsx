"use client";
import { useEffect, useState } from "react";

type MotionPreference = "system" | "reduced" | "full";
const motionKey = "upstream.motion";
const mapKey = "upstream.simplify-map";
function readMotion(): MotionPreference {
  try { const saved = localStorage.getItem(motionKey); return saved === "reduced" || saved === "full" ? saved : "system"; } catch { return "system"; }
}
const systemReduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function applyMotion(value: MotionPreference) {
  document.documentElement.dataset.motion = value === "system" ? (systemReduced() ? "reduced" : "full") : value;
}
export function MotionPreferences() {
  useEffect(() => {
    const update = () => { applyMotion(readMotion()); try { document.documentElement.dataset.simplifyMap = localStorage.getItem(mapKey) === "true" ? "true" : "false"; } catch { /* Device storage is optional. */ } };
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    update(); media.addEventListener("change", update); window.addEventListener("storage", update); window.addEventListener("upstream-preferences", update);
    return () => { media.removeEventListener("change", update); window.removeEventListener("storage", update); window.removeEventListener("upstream-preferences", update); };
  }, []);
  return null;
}

/**
 * Motion and map comfort switches (profile and accessibility pages). "Reduce motion" shows the effective state; until
 * the person chooses, it follows the device setting, and they can return to that at any time.
 */
export function MotionSettings({ compact = false }: { compact?: boolean }) {
  const [motion, setMotion] = useState<MotionPreference>("system");
  const [device, setDevice] = useState(false);
  const [simplify, setSimplify] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setMotion(readMotion()); setDevice(systemReduced()); try { setSimplify(localStorage.getItem(mapKey) === "true"); } catch { /* Defaults remain usable. */ } }, []);
  function save(nextMotion: MotionPreference, nextSimplify: boolean) {
    setMotion(nextMotion); setSimplify(nextSimplify); applyMotion(nextMotion); document.documentElement.dataset.simplifyMap = String(nextSimplify);
    try { localStorage.setItem(motionKey, nextMotion); localStorage.setItem(mapKey, String(nextSimplify)); setMessage("Preferences saved on this device."); window.dispatchEvent(new Event("upstream-preferences")); }
    catch { setMessage("Preferences apply now, but this browser could not save them for your next visit."); }
  }
  const reduced = motion === "system" ? device : motion === "reduced";
  return <div className={`motion-settings ${compact ? "compact" : ""}`}>
    <label className="switch"><input type="checkbox" checked={reduced} onChange={e => save(e.target.checked ? "reduced" : "full", simplify)} aria-describedby="motion-help"/><span className="track" aria-hidden="true"/><span className="switch-label">Reduce motion</span></label>
    <p id="motion-help" className="field-help">Water, wind and drawn lines stop; every feature stays the same. {motion === "system" ? "Following your device setting." : <button type="button" className="button-quiet button" onClick={() => save("system", simplify)}>Follow device setting</button>}</p>
    {compact ? null : <><label className="switch"><input type="checkbox" checked={simplify} onChange={e => save(motion, e.target.checked)} aria-describedby="map-help"/><span className="track" aria-hidden="true"/><span className="switch-label">Simplify map visuals</span></label>
      <p id="map-help" className="field-help">Hides decorative map lines and connectors; stations, reaches and evidence labels stay visible.</p></>}
    <p className="preference-feedback field-help" role="status">{message}</p>
  </div>;
}
