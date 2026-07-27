"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import wardData from "./data/wards.json";

type Ward = {
  ward: number;
  area: string;
  zone: string;
  councillor: string;
  designation: string | null;
  engineeringOfficer: string | null;
  engineeringPhone: string | null;
  waterOfficer: string | null;
  waterPhone: string | null;
  sanitaryInspector: string | null;
  sanitaryPhone: string | null;
};

type GeoFeature = {
  type: "Feature";
  properties: { ward: number; area: string; zone: string };
  geometry: { type: "Polygon"; coordinates: number[][][] };
};

type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

type Report = {
  id: string;
  title: string;
  description: string;
  category: string;
  ward: number;
  zone: string;
  address: string;
  department: string;
  status: string;
  createdAt: string;
  latitude: number;
  longitude: number;
  gpsAccuracy: number;
  aiConfidence: number | null;
  aiSummary: string | null;
  classificationSource: string;
  imageUrl: string;
};

type Analysis = {
  validCivicIssue: boolean;
  category: string;
  summary: string;
  confidence: number;
  rejectionReason: string;
};

type Location = {
  latitude: number;
  longitude: number;
  accuracy: number;
  ward: number;
};

const wards = wardData as Ward[];

const categories = [
  { name: "Road damage", symbol: "⌁", department: "Engineering - Roads / ward AE-JE" },
  { name: "Stormwater drain", symbol: "≋", department: "Engineering - Stormwater / ward AE-JE" },
  { name: "Garbage & sanitation", symbol: "♲", department: "Public Health / Sanitary Inspector" },
  { name: "Water supply", symbol: "◉", department: "Water Supply / ward AE-JE" },
  { name: "Streetlight", symbol: "✦", department: "Engineering / ward AE-JE" },
  { name: "Sewage / UGD", symbol: "≈", department: "UGD / ward AE-JE" },
  { name: "Public health", symbol: "+", department: "Public Health / Sanitary Inspector" },
  { name: "Other civic issue", symbol: "?", department: "Ward engineering contact" },
];

const zoneColours: Record<string, string> = {
  North: "#4e87c8",
  East: "#e18a43",
  West: "#8c70b7",
  South: "#df5e57",
  Central: "#2c9b78",
};

const officialLinks = {
  home: "https://www.ccmc.gov.in/",
  elected: "https://www.ccmc.gov.in/index.php/elected-members",
  officers: "https://www.ccmc.gov.in/index.php/contact-us",
  map: "https://ccmc.gov.in/wardmap.html",
  grievance: "https://grievance.smartccmc.com/",
  whatsapp: "https://wa.me/918190000200",
  phone: "tel:+914222390261",
  email: "mailto:commr.coimbatore@tn.gov.in",
};

function insideRing(point: [number, number], ring: number[][]) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function featureContains(feature: GeoFeature, longitude: number, latitude: number) {
  const [outer, ...holes] = feature.geometry.coordinates;
  return insideRing([longitude, latitude], outer) &&
    !holes.some((ring) => insideRing([longitude, latitude], ring));
}

function routeFor(category: string, ward: Ward | undefined) {
  if (!ward) return { department: "", officer: "", phone: "" };
  if (category === "Garbage & sanitation" || category === "Public health") {
    return {
      department: "CCMC Public Health - Ward Sanitary Inspector",
      officer: ward.sanitaryInspector || "See official directory",
      phone: ward.sanitaryPhone || "",
    };
  }
  if (category === "Water supply") {
    return {
      department: "CCMC Water Supply - Ward AE/JE",
      officer: ward.waterOfficer || "See official directory",
      phone: ward.waterPhone || "",
    };
  }
  const department =
    category === "Stormwater drain"
      ? "CCMC Engineering - Stormwater / Ward AE-JE"
      : category === "Sewage / UGD"
        ? "CCMC UGD - Ward AE/JE"
        : "CCMC Engineering - Ward AE/JE";
  return {
    department,
    officer: ward.engineeringOfficer || "See official directory",
    phone: ward.engineeringPhone || "",
  };
}

function formatCoordinates(value: number) {
  return value.toFixed(6);
}

function timeLabel(date: string) {
  const elapsed = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.round(elapsed / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

async function reducePhoto(file: File): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  try {
    const image = await createImageBitmap(file);
    const maximum = 1600;
    const scale = Math.min(1, maximum / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return original;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch {
    return original;
  }
}

export default function Home() {
  const [view, setView] = useState<"report" | "register" | "map" | "directory" | "data">("report");
  const [reports, setReports] = useState<Report[]>([]);
  const [geo, setGeo] = useState<GeoCollection | null>(null);
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/issues")
      .then((response) => response.json())
      .then((data) => setReports(Array.isArray(data.issues) ? data.issues : []))
      .catch(() => setReports([]));
    fetch("/data/ccmc-wards.geojson")
      .then((response) => response.json())
      .then(setGeo)
      .catch(() => setGeo(null));
  }, []);

  const stats = useMemo(() => {
    const byCategory = reports.reduce<Record<string, number>>((result, report) => {
      result[report.category] = (result[report.category] || 0) + 1;
      return result;
    }, {});
    return {
      total: reports.length,
      wards: new Set(reports.map((report) => report.ward)).size,
      categories: Object.keys(byCategory).length,
      byCategory,
    };
  }, [reports]);

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  };

  return (
    <main>
      <header className="site-header">
        <button className="wordmark" onClick={() => setView("report")}>
          <span className="wordmark-icon">C</span>
          <span><strong>CivicLens</strong><small>Coimbatore civic reporting pilot</small></span>
        </button>
        <nav aria-label="Primary navigation">
          {[
            ["report", "Report an issue"],
            ["register", "Live register"],
            ["map", "Ward map"],
            ["directory", "Ward directory"],
            ["data", "Data sources"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id as typeof view)}
            >
              {label}
              {id === "register" && reports.length > 0 && <span>{reports.length}</span>}
            </button>
          ))}
        </nav>
        <a className="official-action" href={officialLinks.grievance} target="_blank" rel="noreferrer">
          File official grievance ↗
        </a>
      </header>

      <div className="independent-banner">
        <strong>Independent public-interest pilot.</strong>
        <span>CivicLens prepares evidence and routing. Official acknowledgement and tracking begin only after submission through CCMC’s grievance channel.</span>
      </div>

      {view === "report" && (
        <ReportView
          geo={geo}
          reports={reports}
          stats={stats}
          onReport={(report) => {
            setReports((items) => [report, ...items]);
            setView("register");
            toast(`Report ${report.id} saved`);
          }}
          onWard={(ward) => {
            setSelectedWard(ward);
            setView("map");
          }}
        />
      )}
      {view === "register" && (
        <RegisterView
          reports={reports}
          stats={stats}
          onCreate={() => setView("report")}
          onWard={(ward) => {
            setSelectedWard(ward);
            setView("map");
          }}
        />
      )}
      {view === "map" && (
        <WardMap
          geo={geo}
          selectedWard={selectedWard}
          onSelect={setSelectedWard}
          reports={reports}
        />
      )}
      {view === "directory" && <DirectoryView onWard={(ward) => {
        setSelectedWard(ward);
        setView("map");
      }} />}
      {view === "data" && <DataView />}

      <footer>
        <div className="wordmark footer-mark">
          <span className="wordmark-icon">C</span>
          <span><strong>CivicLens</strong><small>Built for evidence-led civic participation</small></span>
        </div>
        <p>Ward, officer and grievance information checked against CCMC public records on 27 July 2026.</p>
        <div><a href={officialLinks.elected} target="_blank" rel="noreferrer">Elected members ↗</a><a href={officialLinks.officers} target="_blank" rel="noreferrer">Ward officers ↗</a><a href={officialLinks.map} target="_blank" rel="noreferrer">Official map ↗</a></div>
      </footer>
      {notice && <div className="toast"><b>✓</b>{notice}</div>}
    </main>
  );
}

function ReportView({
  geo,
  reports,
  stats,
  onReport,
  onWard,
}: {
  geo: GeoCollection | null;
  reports: Report[];
  stats: { total: number; wards: number; categories: number; byCategory: Record<string, number> };
  onReport: (report: Report) => void;
  onWard: (ward: number) => void;
}) {
  return (
    <>
      <section className="hero">
        <div className="hero-orb orb-one" />
        <div className="hero-orb orb-two" />
        <div className="hero-copy">
          <p className="kicker"><span /> Citizen evidence · official ward routing</p>
          <h1>See it.<br />Snap it.<br /><em>Route it right.</em></h1>
          <p className="hero-intro">
            Take a fresh photo, verify the location with device GPS, review the official ward route, then finish the complaint in CCMC’s grievance system.
          </p>
          <div className="proof-row">
            <span><b>100</b> official wards</span>
            <span><b>GPS</b> boundary match</span>
            <span><b>0</b> seeded complaints</span>
          </div>
          <button className="text-link" onClick={() => document.getElementById("report-card")?.scrollIntoView({ behavior: "smooth" })}>
            Start a verified report ↓
          </button>
        </div>
        <ReportCard geo={geo} onReport={onReport} />
      </section>

      <section className="official-grievance-panel" aria-labelledby="official-grievance-title">
        <div className="official-grievance-copy">
          <p className="official-label"><span>✓</span> Official CCMC destination</p>
          <h2 id="official-grievance-title">Prepare here. File officially with CCMC.</h2>
          <p>
            CivicLens helps organise the photo, GPS point, ward and responsible service contact. The official CCMC portal is where citizens receive a government grievance acknowledgement and track disposal.
          </p>
          <div className="official-channel-actions">
            <a className="official-primary" href={officialLinks.grievance} target="_blank" rel="noreferrer">Open official grievance portal <span>↗</span></a>
            <a href={officialLinks.whatsapp} target="_blank" rel="noreferrer">WhatsApp <b>8190000200</b></a>
            <a href={officialLinks.phone}>Call <b>0422-2390261</b></a>
          </div>
        </div>
        <div className="official-flow" aria-label="Complaint handoff steps">
          <div><span>1</span><p><strong>Capture evidence</strong><small>Photo + accurate device GPS</small></p></div>
          <i aria-hidden="true">→</i>
          <div><span>2</span><p><strong>Confirm ward route</strong><small>Official boundary + contact</small></p></div>
          <i aria-hidden="true">→</i>
          <div className="official-flow-final"><span>3</span><p><strong>Submit to CCMC</strong><small>Receive official acknowledgement</small></p></div>
        </div>
      </section>

      <section className="how-it-works">
        <div className="section-heading">
          <div><p className="kicker">No guessed places. No demo incidents.</p><h2>Every report starts with evidence</h2></div>
          <p>The portal calculates only from reports actually submitted by citizens. An empty register stays honestly empty.</p>
        </div>
        <div className="steps-grid">
          {[
            ["01", "Take a live photo", "Use the rear camera. The original scene stays visible for your review before submission."],
            ["02", "Verify GPS", "High-accuracy device coordinates are checked against CCMC’s published ward boundary polygons."],
            ["03", "Classify the issue", "The vision service checks that the photo is civic evidence and proposes one controlled category."],
            ["04", "File through CCMC", "Review the matching ward route, then use the official grievance portal for acknowledgement and status tracking."],
          ].map(([number, title, text]) => (
            <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>
          ))}
        </div>
      </section>

      <section className="truth-panel">
        <div>
          <p className="kicker">Live calculations</p>
          <h2>What citizens have reported so far</h2>
          <p>These numbers come directly from the current report register—not estimates, targets or sample data.</p>
        </div>
        <div className="truth-stats">
          <div><strong>{stats.total}</strong><span>Reports received</span></div>
          <div><strong>{stats.wards}</strong><span>Wards represented</span></div>
          <div><strong>{stats.categories}</strong><span>Detected categories</span></div>
        </div>
        {reports.length === 0 ? (
          <div className="honest-empty"><span>○</span><div><strong>The register is clear</strong><p>No citizen report has been submitted yet. Nothing has been pre-filled.</p></div></div>
        ) : (
          <div className="category-snapshot">
            {Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).map(([category, count]) => (
              <div key={category}><span>{category}</span><i><b style={{ width: `${(count / stats.total) * 100}%` }} /></i><strong>{count}</strong></div>
            ))}
          </div>
        )}
      </section>

      <section className="directory-preview">
        <div className="section-heading">
          <div><p className="kicker">Complete CCMC coverage</p><h2>All five zones. All 100 wards.</h2></div>
          <a href={officialLinks.officers} target="_blank" rel="noreferrer">View official source ↗</a>
        </div>
        <div className="zone-grid">
          {["North", "East", "West", "South", "Central"].map((zone) => {
            const zoneWards = wards.filter((ward) => ward.zone === zone);
            return (
              <article key={zone} style={{ "--zone": zoneColours[zone] } as React.CSSProperties}>
                <span className="zone-dot" />
                <strong>{zone} Zone</strong>
                <p>{zoneWards.length} official wards</p>
                <div>{zoneWards.slice(0, 8).map((ward) => <button key={ward.ward} onClick={() => onWard(ward.ward)}>{ward.ward}</button>)}<span>+{Math.max(0, zoneWards.length - 8)}</span></div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

function ReportCard({ geo, onReport }: { geo: GeoCollection | null; onReport: (report: Report) => void }) {
  const photoInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string>("");
  const [photoName, setPhotoName] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "locating" | "outside" | "error">("idle");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisState, setAnalysisState] = useState<"idle" | "analysing" | "unconfigured" | "error">("idle");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const ward = location ? wards.find((item) => item.ward === location.ward) : undefined;
  const route = routeFor(category, ward);
  const ready = Boolean(photo && location && category && description.trim() && (!analysis || analysis.validCivicIssue));

  const analyse = async (imageData: string) => {
    setAnalysisState("analysing");
    setAnalysis(null);
    setCategory("");
    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      const data = await response.json();
      if (response.status === 503 && data.configured === false) {
        setAnalysisState("unconfigured");
        return;
      }
      if (!response.ok || !data.result) {
        setAnalysisState("error");
        return;
      }
      setAnalysis(data.result);
      setAnalysisState("idle");
      if (data.result.validCivicIssue) {
        setCategory(data.result.category);
        setDescription(data.result.summary || "");
      }
    } catch {
      setAnalysisState("error");
    }
  };

  const capture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Please take or choose an image from the device camera.");
      return;
    }
    const imageData = await reducePhoto(file);
    setPhoto(imageData);
    setPhotoName(file.name);
    await analyse(imageData);
  };

  const locate = () => {
    if (!geo) {
      setError("The official ward boundary file is still loading. Please try again.");
      return;
    }
    if (!navigator.geolocation) {
      setLocationState("error");
      return;
    }
    setLocationState("locating");
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const feature = geo.features.find((item) => featureContains(item, longitude, latitude));
        if (!feature) {
          setLocation(null);
          setLocationState("outside");
          return;
        }
        setLocation({
          latitude,
          longitude,
          accuracy: position.coords.accuracy,
          ward: feature.properties.ward,
        });
        setLocationState("idle");
      },
      () => setLocationState("error"),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !location || !ward) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageData: photo,
          title: `${category} reported in Ward ${ward.ward}`,
          description: description.trim(),
          category,
          ward: ward.ward,
          zone: ward.zone,
          area: ward.area,
          department: route.department,
          assignee: route.officer,
          latitude: location.latitude,
          longitude: location.longitude,
          gpsAccuracy: location.accuracy,
          aiConfidence: analysis?.confidence ?? null,
          aiSummary: analysis?.summary ?? "",
          classificationSource: analysis ? "gemini-vision-confirmed" : "citizen-confirmed",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The report could not be saved.");
      setReceipt(data.issue);
      onReport(data.issue);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The report could not be saved.");
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <div className="report-card receipt" id="report-card">
        <span className="receipt-check">✓</span>
        <p className="card-eyebrow">Step 1 complete · evidence recorded</p>
        <h2>{receipt.id}</h2>
        <p>Your photo, GPS accuracy and Ward {receipt.ward} routing record have been saved.</p>
        <div className="receipt-route"><small>Recommended CCMC route</small><strong>{receipt.department}</strong></div>
        <div className="receipt-warning"><b>Step 2</b><span>Submit through the official CCMC grievance portal to receive a government acknowledgement and status tracking.</span></div>
        <a className="primary-btn" href={officialLinks.grievance} target="_blank" rel="noreferrer">File officially with CCMC ↗</a>
        <a className="secondary-btn" href={officialLinks.whatsapp} target="_blank" rel="noreferrer">Open CCMC WhatsApp · 8190000200</a>
      </div>
    );
  }

  return (
    <form className="report-card" id="report-card" onSubmit={submit}>
      <div className="report-card-heading">
        <div><p className="card-eyebrow">New verified report</p><h2>Start with what you can see</h2></div>
        <span>3 checks</span>
      </div>

      <div className="capture-zone">
        {photo ? (
          <>
            <img src={photo} alt="Civic evidence preview" />
            <button type="button" className="retake" onClick={() => photoInput.current?.click()}>↻ Retake</button>
            <span className="photo-file">Camera image ready</span>
          </>
        ) : (
          <button type="button" className="camera-button" onClick={() => photoInput.current?.click()}>
            <span className="camera-icon"><i /></span>
            <strong>Open camera</strong>
            <small>Take a clear photo of the civic issue</small>
          </button>
        )}
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={capture}
          aria-label="Take a civic issue photo"
        />
      </div>

      <div className="check-row">
        <span className={photo ? "check-icon done" : "check-icon"}>{photo ? "✓" : "1"}</span>
        <div><strong>Camera evidence</strong><small>{photo ? photoName || "Photo captured" : "Required before submission"}</small></div>
        {analysisState === "analysing" && <b className="checking">Analysing…</b>}
      </div>

      {photo && (
        <div className={`analysis-box ${analysis?.validCivicIssue ? "valid" : analysis?.validCivicIssue === false ? "rejected" : ""}`}>
          {analysisState === "analysing" && <><span className="scan-symbol">✦</span><div><strong>Checking the photograph</strong><p>Looking only for visible civic evidence and a supported category.</p></div></>}
          {analysis?.validCivicIssue && <><span className="scan-symbol">✓</span><div><strong>Visible civic issue detected</strong><p>{analysis.summary}</p><small>Classification confidence {Math.round(analysis.confidence * 100)}% · You can correct the category below.</small></div></>}
          {analysis?.validCivicIssue === false && <><span className="scan-symbol">!</span><div><strong>This photo cannot be accepted</strong><p>{analysis.rejectionReason || "No supported public-space civic issue is visible."}</p><small>Please retake a clear photograph of the issue.</small></div></>}
          {analysisState === "unconfigured" && <><span className="scan-symbol">○</span><div><strong>Automatic vision is not connected yet</strong><p>No category will be invented. Select the visible issue yourself until the secure Gemini key is added.</p></div></>}
          {analysisState === "error" && <><span className="scan-symbol">○</span><div><strong>Photo analysis is temporarily unavailable</strong><p>You can confirm the category manually; the report will record that it was citizen-classified.</p></div></>}
        </div>
      )}

      {photo && analysis?.validCivicIssue !== false && (
        <div className="category-picker">
          <label>Visible problem category</label>
          <div>{categories.map((item) => (
            <button type="button" key={item.name} className={category === item.name ? "active" : ""} onClick={() => setCategory(item.name)}>
              <span>{item.symbol}</span>{item.name}
            </button>
          ))}</div>
        </div>
      )}

      <div className="check-row">
        <span className={location ? "check-icon done" : "check-icon"}>{location ? "✓" : "2"}</span>
        <div><strong>Device GPS</strong><small>{location ? `Ward ${location.ward} · accuracy ±${Math.round(location.accuracy)} m` : "No ward is guessed manually"}</small></div>
        <button type="button" className="location-button" onClick={locate} disabled={locationState === "locating"}>
          {locationState === "locating" ? "Locating…" : location ? "Refresh GPS" : "Use my location"}
        </button>
      </div>
      {location && ward && (
        <div className="gps-result">
          <div><small>Official ward match</small><strong>Ward {ward.ward} · {ward.zone} Zone</strong><p>{ward.area}</p></div>
          <div><span>LAT {formatCoordinates(location.latitude)}</span><span>LNG {formatCoordinates(location.longitude)}</span><span>±{Math.round(location.accuracy)} m</span></div>
        </div>
      )}
      {locationState === "outside" && <p className="field-error">Your GPS point is outside the 100 CCMC ward boundaries in the official February 2022 GeoJSON. The portal will not guess a ward.</p>}
      {locationState === "error" && <p className="field-error">Location permission or a high-accuracy GPS reading was unavailable. Enable precise location and try again.</p>}

      {ward && category && (
        <div className="route-card">
          <div className="route-line"><span>3</span><div><small>Recommended from official ward directory</small><strong>{route.department}</strong></div></div>
          <div className="official-person">
            <div><small>Ward contact</small><strong>{route.officer}</strong><span>Ward {ward.ward} · {ward.zone}</span></div>
            {route.phone && <a href={`tel:${route.phone.replace(/\D/g, "")}`}>{route.phone}</a>}
          </div>
          <div className="councillor-line"><span>Councillor</span><strong>{ward.councillor}</strong>{ward.ward === 56 && <b>Official listing: vacant</b>}</div>
        </div>
      )}

      {ward && category && (
        <label className="description-field">
          <span>Describe only what you observed</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
            placeholder="Example: The drain is blocked and water is covering the pedestrian path."
            required
          />
          <small>{description.length}/1000</small>
        </label>
      )}

      {error && <p className="field-error">{error}</p>}
      <button className="submit-report" disabled={!ready || submitting}>
        {submitting ? "Saving evidence…" : "Save report and show official route →"}
      </button>
      <p className="privacy-note">Your coordinates and photograph are stored only when you press submit. The visible GPS accuracy is saved with the report.</p>
    </form>
  );
}

function RegisterView({
  reports,
  stats,
  onCreate,
  onWard,
}: {
  reports: Report[];
  stats: { total: number; wards: number; categories: number; byCategory: Record<string, number> };
  onCreate: () => void;
  onWard: (ward: number) => void;
}) {
  const [filter, setFilter] = useState("All categories");
  const filtered = filter === "All categories" ? reports : reports.filter((report) => report.category === filter);
  return (
    <section className="page register-page">
      <div className="page-title">
        <div><p className="kicker">Citizen-submitted records only</p><h1>Live civic register</h1><p>No seeded issues, assumed SLA values or invented priority messages.</p></div>
        <button className="primary-btn compact" onClick={onCreate}>＋ Create verified report</button>
      </div>
      <div className="metric-strip">
        <div><strong>{stats.total}</strong><span>Total reports</span></div>
        <div><strong>{stats.wards}</strong><span>Wards reporting</span></div>
        <div><strong>{stats.categories}</strong><span>Observed categories</span></div>
        <div><strong>{reports.filter((report) => report.classificationSource.includes("vision")).length}</strong><span>Vision-confirmed</span></div>
      </div>
      <div className="register-tools">
        <div className="filter-chips">
          {["All categories", ...Object.keys(stats.byCategory)].map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
              {item}{item !== "All categories" && <span>{stats.byCategory[item]}</span>}
            </button>
          ))}
        </div>
        <span>{filtered.length} records</span>
      </div>
      {filtered.length === 0 ? (
        <div className="large-empty">
          <div className="empty-rings"><span /></div>
          <p className="kicker">Honest empty state</p>
          <h2>No citizen reports yet</h2>
          <p>The public register begins when a person submits a camera photo and verified GPS point. We have removed all demonstration complaints.</p>
          <button className="primary-btn" onClick={onCreate}>Create the first verified report</button>
        </div>
      ) : (
        <div className="report-grid">
          {filtered.map((report) => (
            <article key={report.id}>
              <div className="report-photo"><img src={report.imageUrl} alt={`Evidence for ${report.category}`} /><span>{report.status}</span></div>
              <div className="report-body">
                <div className="report-meta"><span>{report.id}</span><time>{timeLabel(report.createdAt)}</time></div>
                <h2>{report.category}</h2>
                <p>{report.description}</p>
                <div className="report-location"><span>⌖</span><div><strong>Ward {report.ward} · {report.zone} Zone</strong><small>{report.address}</small></div></div>
                <div className="evidence-row"><span>GPS ±{Math.round(report.gpsAccuracy)} m</span><span>{report.classificationSource.includes("vision") ? `AI ${Math.round((report.aiConfidence || 0) * 100)}%` : "Citizen confirmed"}</span></div>
                <button onClick={() => onWard(report.ward)}>View official ward route →</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WardMap({
  geo,
  selectedWard,
  onSelect,
  reports,
}: {
  geo: GeoCollection | null;
  selectedWard: number | null;
  onSelect: (ward: number) => void;
  reports: Report[];
}) {
  const [zone, setZone] = useState("All zones");
  const selected = wards.find((ward) => ward.ward === selectedWard);

  const projection = useMemo(() => {
    if (!geo) return null;
    const points = geo.features.flatMap((feature) => feature.geometry.coordinates.flat());
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const project = ([x, y]: number[]) => [
      28 + ((x - minX) / (maxX - minX)) * 944,
      28 + ((maxY - y) / (maxY - minY)) * 644,
    ];
    return { project };
  }, [geo]);

  const pathFor = (feature: GeoFeature) => {
    if (!projection) return "";
    return feature.geometry.coordinates.map((ring) =>
      ring.map((point, index) => {
        const [x, y] = projection.project(point);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ") + " Z",
    ).join(" ");
  };

  const centreFor = (feature: GeoFeature) => {
    if (!projection) return [0, 0];
    const ring = feature.geometry.coordinates[0];
    const sum = ring.reduce(([x, y], point) => [x + point[0], y + point[1]], [0, 0]);
    return projection.project([sum[0] / ring.length, sum[1] / ring.length]);
  };

  const reportCounts = reports.reduce<Record<number, number>>((result, report) => {
    result[report.ward] = (result[report.ward] || 0) + 1;
    return result;
  }, {});

  return (
    <section className="page map-page">
      <div className="page-title">
        <div><p className="kicker">Official February 2022 CCMC polygons</p><h1>All 100 ward boundaries</h1><p>Click a boundary to see its current elected member and ward service contacts.</p></div>
        <div className="zone-select">{["All zones", "North", "East", "West", "South", "Central"].map((item) => <button key={item} className={zone === item ? "active" : ""} onClick={() => setZone(item)}>{item}</button>)}</div>
      </div>
      <div className="map-shell">
        <div className="official-map">
          {!geo || !projection ? <div className="map-loading">Loading official ward polygons…</div> : (
            <svg viewBox="0 0 1000 700" role="img" aria-label="Official CCMC ward boundary map">
              <rect width="1000" height="700" rx="20" fill="transparent" />
              {geo.features.map((feature) => {
                const active = feature.properties.ward === selectedWard;
                const dimmed = zone !== "All zones" && feature.properties.zone !== zone;
                return (
                  <g key={feature.properties.ward} className={active ? "ward-shape active" : dimmed ? "ward-shape dimmed" : "ward-shape"}>
                    <path
                      d={pathFor(feature)}
                      fill={zoneColours[feature.properties.zone] || "#789"}
                      onClick={() => onSelect(feature.properties.ward)}
                    />
                    <text
                      x={centreFor(feature)[0]}
                      y={centreFor(feature)[1]}
                      onClick={() => onSelect(feature.properties.ward)}
                    >
                      {feature.properties.ward}
                    </text>
                    {reportCounts[feature.properties.ward] > 0 && (
                      <circle cx={centreFor(feature)[0] + 9} cy={centreFor(feature)[1] - 10} r="5" />
                    )}
                  </g>
                );
              })}
            </svg>
          )}
          <div className="map-key">
            {Object.entries(zoneColours).map(([name, colour]) => <span key={name}><i style={{ background: colour }} />{name}</span>)}
            <span><i className="report-dot" />Citizen report</span>
          </div>
        </div>
        <aside className="ward-detail">
          {selected ? (
            <>
              <div className="ward-number"><small>CCMC ward</small><strong>{selected.ward}</strong><span style={{ background: zoneColours[selected.zone] }}>{selected.zone} Zone</span></div>
              <h2>{selected.area}</h2>
              <p className="source-stamp">Matched to official CCMC ward and officer records · checked 27 Jul 2026</p>
              <div className="contact-block">
                <small>Elected member</small>
                <strong>{selected.councillor}</strong>
                <span>{selected.designation || "Official listing: vacant"}</span>
              </div>
              <Contact name={selected.engineeringOfficer} phone={selected.engineeringPhone} label="Engineering AE / JE" />
              <Contact name={selected.waterOfficer} phone={selected.waterPhone} label="Water Supply AE / JE" />
              <Contact name={selected.sanitaryInspector} phone={selected.sanitaryPhone} label="Sanitary Inspector" />
              <div className="ward-report-count"><span>{reportCounts[selected.ward] || 0}</span><div><strong>citizen reports</strong><small>Calculated from this register</small></div></div>
              <a className="secondary-btn" href={officialLinks.officers} target="_blank" rel="noreferrer">Verify on CCMC website ↗</a>
            </>
          ) : (
            <div className="choose-ward"><span>⌖</span><h2>Select a ward</h2><p>The map contains all 100 official boundaries. No pin or locality has been added manually.</p></div>
          )}
        </aside>
      </div>
    </section>
  );
}

function Contact({ name, phone, label }: { name: string | null; phone: string | null; label: string }) {
  return (
    <div className="contact-row">
      <div><small>{label}</small><strong>{name || "See official directory"}</strong></div>
      {phone && <a href={`tel:${phone.replace(/\D/g, "")}`}>{phone}</a>}
    </div>
  );
}

function DirectoryView({ onWard }: { onWard: (ward: number) => void }) {
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("All zones");
  const filtered = wards.filter((ward) => {
    const text = `${ward.ward} ${ward.area} ${ward.zone} ${ward.councillor} ${ward.engineeringOfficer} ${ward.waterOfficer} ${ward.sanitaryInspector}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (zone === "All zones" || ward.zone === zone);
  });
  return (
    <section className="page directory-page">
      <div className="page-title">
        <div><p className="kicker">Official public records · 100 wards</p><h1>Ward representatives & contacts</h1><p>Search elected members and ward-level engineering, water and sanitation officers.</p></div>
        <a className="source-button" href={officialLinks.elected} target="_blank" rel="noreferrer">Open CCMC source ↗</a>
      </div>
      <div className="directory-search">
        <label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ward, area, councillor or officer" /></label>
        <select value={zone} onChange={(event) => setZone(event.target.value)} aria-label="Filter directory by zone">
          {["All zones", "North", "East", "West", "South", "Central"].map((item) => <option key={item}>{item}</option>)}
        </select>
        <span>{filtered.length} official wards</span>
      </div>
      <div className="directory-grid">
        {filtered.map((ward) => (
          <article key={ward.ward}>
            <div className="ward-card-head">
              <span style={{ background: zoneColours[ward.zone] }}>{ward.ward}</span>
              <div><strong>{ward.area}</strong><small>{ward.zone} Zone</small></div>
              <button onClick={() => onWard(ward.ward)}>Map ↗</button>
            </div>
            <div className="councillor-card"><small>Elected member</small><strong>{ward.councillor}</strong><span>{ward.designation || "Official listing: vacant"}</span></div>
            <div className="mini-contacts">
              <MiniContact label="Engineering" name={ward.engineeringOfficer} phone={ward.engineeringPhone} />
              <MiniContact label="Water" name={ward.waterOfficer} phone={ward.waterPhone} />
              <MiniContact label="Sanitation" name={ward.sanitaryInspector} phone={ward.sanitaryPhone} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MiniContact({ label, name, phone }: { label: string; name: string | null; phone: string | null }) {
  return (
    <div><span>{label}</span><strong>{name || "Not listed"}</strong>{phone ? <a href={`tel:${phone.replace(/\D/g, "")}`}>{phone}</a> : <small>Verify on CCMC</small>}</div>
  );
}

function DataView() {
  return (
    <section className="page data-page">
      <div className="page-title"><div><p className="kicker">Traceable, not invented</p><h1>Where every fact comes from</h1><p>CivicLens separates official reference data, citizen evidence and automated classification.</p></div></div>
      <div className="principles-grid">
        <article><span>01</span><h2>No seeded incidents</h2><p>Complaint cards and statistics begin at zero. Only a completed citizen submission changes the public register.</p></article>
        <article><span>02</span><h2>No guessed GPS wards</h2><p>The device coordinate is tested against the published CCMC polygon. Outside the boundary, submission stops.</p></article>
        <article><span>03</span><h2>No implied government receipt</h2><p>This pilot recommends the official ward contact and links to CCMC’s grievance channels; it does not falsely mark a report as accepted by CCMC.</p></article>
        <article><span>04</span><h2>No hidden AI claim</h2><p>Reports state whether classification came from Gemini Vision or citizen confirmation. If the service is not connected, the interface says so.</p></article>
      </div>
      <div className="sources-table">
        <div className="sources-heading"><div><p className="kicker">Official source register</p><h2>CCMC reference data</h2></div><span>Checked 27 July 2026</span></div>
        {[
          ["100 ward boundaries", "Ward_Boundary_Feb_2022.geojson", "Used for map drawing and point-in-polygon GPS matching", officialLinks.map],
          ["Current elected members", "CCMC Elected Members directory", "Ward 1–100 representative names and official designations", officialLinks.elected],
          ["Ward engineering officers", "Five CCMC zonal officer directories", "AE/JE names and public phone numbers for every ward", officialLinks.officers],
          ["Water and sanitation contacts", "Five CCMC zonal officer directories", "Water AE/JE and Sanitary Inspector names and public phone numbers", officialLinks.officers],
          ["Official complaint channel", "CCMC grievance portal and WhatsApp", "Government-controlled destination for formal acknowledgement", officialLinks.grievance],
        ].map(([data, source, use, url]) => (
          <a href={url} target="_blank" rel="noreferrer" key={data}><strong>{data}</strong><span>{source}</span><p>{use}</p><b>Verify ↗</b></a>
        ))}
      </div>
      <div className="accuracy-note">
        <span>!</span>
        <div><strong>Public records can change</strong><p>Councillors and officers may be transferred or replaced. Each directory entry links back to CCMC so citizens can verify the latest official listing before calling.</p></div>
      </div>
    </section>
  );
}
