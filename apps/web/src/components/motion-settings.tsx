"use client";
import { useEffect, useState } from "react";

type MotionPreference = "system" | "reduced" | "full";
const motionKey = "upstream.motion";
const mapKey = "upstream.simplify-map";
function readMotion(): MotionPreference {
  try { const saved = localStorage.getItem(motionKey); return saved === "reduced" || saved === "full" ? saved : "system"; } catch { return "system"; }
}
function applyMotion(value: MotionPreference) {
  document.documentElement.dataset.motion = value === "system" ? (matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full") : value;
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
export function MotionSettings() {
  const [motion, setMotion] = useState<MotionPreference>("system");
  const [simplify, setSimplify] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setMotion(readMotion()); try { setSimplify(localStorage.getItem(mapKey) === "true"); } catch { /* Defaults remain usable. */ } }, []);
  function save(nextMotion: MotionPreference, nextSimplify: boolean) {
    setMotion(nextMotion); setSimplify(nextSimplify); applyMotion(nextMotion); document.documentElement.dataset.simplifyMap = String(nextSimplify);
    try { localStorage.setItem(motionKey, nextMotion); localStorage.setItem(mapKey, String(nextSimplify)); setMessage("Preferences saved on this device."); window.dispatchEvent(new Event("upstream-preferences")); }
    catch { setMessage("Preferences apply now, but this browser could not save them for your next visit."); }
  }
  return <section className="preference-panel" aria-labelledby="display-preferences"><h2 id="display-preferences">Make yourself comfortable.</h2><div className="form-field"><label htmlFor="motion-preference">Motion</label><select id="motion-preference" value={motion} onChange={event => save(event.target.value as MotionPreference, simplify)}><option value="system">Follow device setting</option><option value="reduced">Reduced motion</option><option value="full">Full motion</option></select><p className="field-help">Reduced motion removes decorative movement and animated transitions.</p></div><label className="checkbox-field"><input type="checkbox" checked={simplify} onChange={event => save(motion, event.target.checked)}/><span>Simplify map visuals</span></label><p className="field-help">Reduce decorative map detail while keeping stations, reaches, and evidence labels visible.</p><p className="preference-feedback" role="status">{message}</p></section>;
}
