'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';
import { Download, Upload, RefreshCw, Image as ImageIcon, Move, Type, BookmarkPlus, Trash2, LayoutGrid, Plus, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    htmlToImage: any;
  }
}

/* ── All available fonts ── */
const FONTS = [
  { label: 'Black Ops One',       value: "var(--font-blackops), 'Black Ops One', sans-serif" },
  { label: 'Bebas Neue',          value: "var(--font-bebas), 'Bebas Neue', sans-serif" },
  { label: 'Inter',               value: "var(--font-inter), Inter, sans-serif" },
  { label: 'Asket Extrabold',     value: "'Asket', sans-serif" },
  { label: 'Asket Condensed',     value: "'Asket Condensed', sans-serif" },
  { label: 'Asket Narrow',        value: "'Asket Narrow', sans-serif" },
  { label: 'Asket Extended',      value: "'Asket Extended', sans-serif" },
];

interface PosterData {
  productName: string;
  itemCode: string;
  price: string;
  size: string;
  stock: string;
  productImage: string | null;
  bgImage: string;              // background template image
  // Image
  imgX: number; imgY: number; imgScale: number;
  // Product name
  nameFont: string; nameFontSize: number; nameX: number; nameY: number;
  // Item code
  codeFont: string; codeFontSize: number; codeX: number; codeY: number;
  // Price
  priceFont: string; priceFontSize: number; priceX: number; priceY: number;
  // Badges
  badgeFont: string; badgeFontSize: number;
  badgeSizeX: number; badgeSizeY: number;
  badgeStockX: number; badgeStockY: number;
}

const DEFAULT_BG = '/helmet.png';

const DEFAULT: PosterData = {
  productName: 'HELMET',
  itemCode: 'RRGHEA220267',
  price: '4,500',
  size: 'M',
  stock: '1',
  productImage: null,
  bgImage: DEFAULT_BG,
  imgX: 0, imgY: 0, imgScale: 100,
  nameFont: FONTS[0].value, nameFontSize: 70, nameX: 0, nameY: 0,
  codeFont: FONTS[2].value, codeFontSize: 18, codeX: 0, codeY: 0,
  priceFont: FONTS[2].value, priceFontSize: 33, priceX: 0, priceY: 0,
  badgeFont: FONTS[2].value, badgeFontSize: 19,
  badgeSizeX: 0, badgeSizeY: 0, badgeStockX: 0, badgeStockY: 0,
};

/* ── Slider row ── */
function Slider({ label, min, max, step = 1, value, unit = '', onChange }: {
  label: string; min: number; max: number; step?: number;
  value: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="srow">
      <span className="srow-lbl">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} />
      <span className="srow-val">{value}{unit}</span>
    </div>
  );
}

/* ── Font selector row ── */
function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="srow">
      <span className="srow-lbl">Font</span>
      <select className="fsel" value={value} onChange={e => onChange(e.target.value)}>
        {FONTS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ── Template from DB ── */
interface DbTemplate {
  _id: string;
  name: string;
  image: string;  // base64 data-URL
  createdAt: string;
}

/* ── Preset type ── */
interface Preset {
  id: string;
  name: string;
  createdAt: number;
  settings: Omit<PosterData, 'productImage'>;   // bgImage IS included in presets
}

const STORAGE_KEY = 'deon_poster_presets';

export default function PosterGeneratorPage() {
  const [data, setData] = useState<PosterData>(DEFAULT);
  const [generating, setGenerating] = useState(false);
  const [h2cReady, setH2cReady] = useState(false);
  const [openSection, setOpenSection] = useState<string>('content');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState('');
  const posterRef = useRef<HTMLDivElement>(null);

  /* ── DB Templates state ── */
  const [dbTemplates, setDbTemplates] = useState<DbTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [importingTemplate, setImportingTemplate] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch('/api/templates');
      if (res.ok) setDbTemplates(await res.json());
    } catch (err) { console.error('Failed to fetch templates', err); }
    finally { setLoadingTemplates(false); }
  }, []);

  const importTemplate = async (file: File) => {
    setImportingTemplate(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const name = file.name.replace(/\.[^.]+$/, '');
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, image: dataUrl }),
      });
      if (res.ok) await fetchTemplates();
      else alert('Failed to save template');
    } catch (err) { console.error(err); alert('Import failed'); }
    finally { setImportingTemplate(false); }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (res.ok) setDbTemplates(prev => prev.filter(t => t._id !== id));
      else alert('Delete failed');
    } catch (err) { console.error(err); }
  };

  /* Load presets from localStorage + templates from DB on mount */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch {}
    fetchTemplates();
  }, [fetchTemplates]);

  const persistPresets = (list: Preset[]) => {
    setPresets(list);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const { productImage: _img, ...settings } = data; // exclude image
    const newPreset: Preset = { id: Date.now().toString(), name, createdAt: Date.now(), settings };
    persistPresets([...presets, newPreset]);
    setPresetName('');
  };

  const loadPreset = (preset: Preset) => {
    setData(prev => ({ ...preset.settings, productImage: prev.productImage }));
  };

  const deletePreset = (id: string) => {
    persistPresets(presets.filter(p => p.id !== id));
  };

  const update = <K extends keyof PosterData>(key: K, value: PosterData[K]) =>
    setData(prev => ({ ...prev, [key]: value }));

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => update('productImage', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => update('bgImage', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDownload = useCallback(async () => {
    if (!posterRef.current || !window.htmlToImage) {
      alert('Still loading… please wait a moment.');
      return;
    }
    setGenerating(true);
    try {
      // html-to-image handles fonts and CSS variables flawlessly
      const dataUrl = await window.htmlToImage.toPng(posterRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      const a = document.createElement('a');
      a.download = `DEON_${data.productName}_${data.itemCode}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error(err);
      alert('Download failed. Try again.');
    } finally { setGenerating(false); }
  }, [data]);

  const toggle = (s: string) => setOpenSection(prev => prev === s ? '' : s);

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js"
        strategy="afterInteractive"
        onLoad={() => setH2cReady(true)}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .pg {
          min-height: 100vh;
          background: linear-gradient(135deg, #06101f 0%, #0c1e44 55%, #06101f 100%);
          font-family: var(--font-inter), Inter, sans-serif;
          padding: 28px 16px 60px;
          display: flex; flex-direction: column; align-items: center; gap: 24px;
        }
        .pg h1 {
          font-size: 1.7rem; font-weight: 800;
          background: linear-gradient(90deg, #60a5fa, #93c5fd);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text; text-align: center;
        }
        .pg > p { font-size: .78rem; color: #475569; text-align: center; }
        .layout {
          display: flex; flex-wrap: wrap; gap: 24px;
          align-items: flex-start; justify-content: center;
          width: 100%; max-width: 1140px;
        }

        /* ── Control Panel ── */
        .cp {
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 18px; padding: 18px;
          width: 310px; flex-shrink: 0;
          max-height: 88vh; overflow-y: auto;
        }
        .cp::-webkit-scrollbar { width: 4px; }
        .cp::-webkit-scrollbar-track { background: transparent; }
        .cp::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
        .cp-title { font-size: .86rem; font-weight: 700; color: #e2e8f0; margin-bottom: 14px; }

        /* Text inputs */
        .f { margin-bottom: 10px; }
        .f label {
          display: block; font-size: .58rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px; color: #3d5270; margin-bottom: 4px;
        }
        .f input[type="text"] {
          width: 100%; padding: 7px 10px;
          background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px; color: white; font-size: .83rem;
          font-family: var(--font-inter), Inter, sans-serif; outline: none; transition: border-color .2s;
        }
        .f input[type="text"]:focus { border-color: #3b82f6; }
        .fr { display: flex; gap: 8px; }
        .fr .f { flex: 1; }

        /* Image uploader */
        .iu {
          width: 100%; height: 90px;
          border: 2px dashed rgba(255,255,255,.14); border-radius: 10px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          cursor: pointer; overflow: hidden; position: relative;
          background: rgba(255,255,255,.03); transition: border-color .2s;
        }
        .iu:hover { border-color: #3b82f6; }
        .iu img { width: 100%; height: 100%; object-fit: contain; }
        .iu-ov {
          position: absolute; inset: 0; background: rgba(0,0,0,.5);
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transition: opacity .2s; color: white; font-size: .68rem; gap: 4px;
        }
        .iu:hover .iu-ov { opacity: 1; }
        .iu-ph { display: flex; flex-direction: column; align-items: center; gap: 5px; color: #2d3f58; font-size: .68rem; }

        /* Accordion */
        .acc { margin-top: 10px; border-top: 1px solid rgba(255,255,255,.07); padding-top: 10px; }
        .acc-hdr {
          display: flex; align-items: center; justify-content: space-between;
          cursor: pointer; padding: 5px 0; user-select: none;
          color: #60a5fa; font-size: .7rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px;
        }
        .acc-hdr:hover { color: #93c5fd; }
        .acc-hdr span { display: flex; align-items: center; gap: 6px; }
        .acc-arrow { font-size: .65rem; transition: transform .2s; display: inline-block; }
        .acc-arrow.open { transform: rotate(180deg); }
        .acc-body { padding: 8px 0 4px; }

        /* Sliders */
        .srow { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
        .srow-lbl {
          font-size: .58rem; font-weight: 600; color: #64748b;
          text-transform: uppercase; letter-spacing: .7px;
          min-width: 52px; flex-shrink: 0;
        }
        .srow input[type="range"] {
          flex: 1; height: 3px; accent-color: #3b82f6; cursor: pointer;
        }
        .srow-val {
          font-size: .7rem; color: #60a5fa; font-weight: 700;
          min-width: 36px; text-align: right; font-family: monospace;
        }

        /* Font select */
        .fsel {
          flex: 1;
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 7px;
          color: #e2e8f0;
          font-size: .75rem;
          padding: 5px 8px;
          outline: none;
          cursor: pointer;
          transition: border-color .2s;
        }
        .fsel:focus { border-color: #3b82f6; }
        .fsel option { background: #0c1e44; color: #e2e8f0; }

        /* Sub-dividers within accordion */
        .sub-hdr {
          font-size: .6rem; font-weight: 800; letter-spacing: 1.2px;
          text-transform: uppercase; color: #1e40af;
          margin: 11px 0 7px; padding-top: 9px;
          border-top: 1px dashed rgba(255,255,255,.06);
        }
        .sub-hdr:first-child { border-top: none; margin-top: 2px; }

        /* Font preview strip */
        .font-preview {
          display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;
        }
        .fp-chip {
          padding: 4px 9px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 20px;
          font-size: 11px; color: #cbd5e1;
          cursor: pointer; transition: all .15s;
          white-space: nowrap;
        }
        .fp-chip:hover { border-color: #3b82f6; color: #93c5fd; }
        .fp-chip.active { background: rgba(59,130,246,.2); border-color: #3b82f6; color: #60a5fa; }

        /* Buttons */
        .acts { display: flex; gap: 7px; margin-top: 14px; }
        .btn-d {
          flex: 1; padding: 10px;
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          color: white; border: none; border-radius: 9px;
          font-weight: 700; font-size: .82rem; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          transition: all .2s; box-shadow: 0 4px 14px rgba(37,99,235,.35);
        }
        .btn-d:hover { transform: translateY(-1px); }
        .btn-d:disabled { opacity: .5; cursor: not-allowed; transform: none; }
        .btn-r {
          padding: 10px 12px;
          background: rgba(255,255,255,.06); color: #475569;
          border: 1px solid rgba(255,255,255,.08); border-radius: 9px;
          cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s;
        }
        .btn-r:hover { background: rgba(255,255,255,.1); color: #94a3b8; }
        .note { font-size: .62rem; color: #2d3f58; text-align: center; margin-top: 6px; }

        /* ── Preset UI ── */
        .preset-save-row { display: flex; gap: 6px; margin-bottom: 10px; }
        .preset-save-row input {
          flex: 1; padding: 7px 10px;
          background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px; color: white; font-size: .8rem; outline: none; transition: border-color .2s;
        }
        .preset-save-row input:focus { border-color: #3b82f6; }
        .preset-save-row input::placeholder { color: #2d3f58; }
        .btn-save-preset {
          padding: 7px 12px; background: rgba(59,130,246,.25);
          border: 1px solid rgba(59,130,246,.4); border-radius: 8px;
          color: #60a5fa; cursor: pointer; font-size: .78rem; font-weight: 700;
          display: flex; align-items: center; gap: 5px; transition: all .2s; white-space: nowrap;
        }
        .btn-save-preset:hover { background: rgba(59,130,246,.4); border-color: #60a5fa; }
        .btn-save-preset:disabled { opacity: .35; cursor: not-allowed; }
        .preset-list { display: flex; flex-direction: column; gap: 6px; }
        .preset-item {
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
          border-radius: 10px; padding: 8px 10px;
          transition: border-color .2s;
        }
        .preset-item:hover { border-color: rgba(96,165,250,.4); }
        .preset-info { flex: 1; min-width: 0; }
        .preset-name { font-size: .8rem; font-weight: 700; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .preset-date { font-size: .6rem; color: #334155; margin-top: 1px; }
        .preset-actions { display: flex; gap: 5px; flex-shrink: 0; margin-left: 8px; }
        .btn-load {
          padding: 4px 10px; background: rgba(59,130,246,.2);
          border: 1px solid rgba(59,130,246,.35); border-radius: 6px;
          color: #60a5fa; cursor: pointer; font-size: .72rem; font-weight: 700; transition: all .2s;
        }
        .btn-load:hover { background: rgba(59,130,246,.35); }
        .btn-del {
          padding: 4px 7px; background: rgba(239,68,68,.1);
          border: 1px solid rgba(239,68,68,.2); border-radius: 6px;
          color: #f87171; cursor: pointer; display: flex; align-items: center; transition: all .2s;
        }
        .btn-del:hover { background: rgba(239,68,68,.2); border-color: #f87171; }
        .preset-empty { font-size: .72rem; color: #1e3a5f; text-align: center; padding: 14px 0; }

        /* ── Template Gallery ── */
        .tpl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
        .tpl-card {
          position: relative; border-radius: 10px; overflow: hidden;
          border: 2px solid rgba(255,255,255,.08); cursor: pointer;
          transition: all .2s; aspect-ratio: 1;
        }
        .tpl-card:hover { border-color: #3b82f6; transform: scale(1.03); }
        .tpl-card.active { border-color: #60a5fa; box-shadow: 0 0 12px rgba(96,165,250,.35); }
        .tpl-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tpl-card-name {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: linear-gradient(transparent, rgba(0,0,0,.85));
          padding: 14px 5px 4px; font-size: .55rem; color: #e2e8f0;
          font-weight: 700; text-align: center;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .tpl-card-del {
          position: absolute; top: 3px; right: 3px;
          background: rgba(0,0,0,.65); border: none; border-radius: 50%;
          width: 20px; height: 20px;
          display: flex; align-items: center; justify-content: center;
          color: #f87171; cursor: pointer; opacity: 0; transition: opacity .2s;
        }
        .tpl-card:hover .tpl-card-del { opacity: 1; }
        .tpl-card-del:hover { background: rgba(239,68,68,.3); }
        .tpl-import {
          border: 2px dashed rgba(255,255,255,.14); border-radius: 10px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          cursor: pointer; color: #2d3f58; font-size: .6rem; gap: 4px;
          transition: all .2s; aspect-ratio: 1;
        }
        .tpl-import:hover { border-color: #3b82f6; color: #60a5fa; }

        /* Poster wrapper */
        .pw { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .pw-lbl { font-size: .64rem; color: #2d3f58; }

        /* ══ POSTER ══ */
        .poster {
          width: 540px; height: 540px;
          position: relative; overflow: hidden; flex-shrink: 0;
          box-shadow: 0 30px 75px rgba(0,0,0,.7);
        }
        .poster-bg {
          position: absolute; inset: 0;
          width: 100%; height: 100%; object-fit: fill; z-index: 0; display: block;
        }
        .ov { position: absolute; z-index: 10; }
        .ov-prod-ph {
          position: absolute; z-index: 10;
          border: 2px dashed rgba(20,56,181,.28); border-radius: 14px;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          color: rgba(20,56,181,.38); font-size: 11px; gap: 8px;
        }
      `}</style>

      <div className="pg">
        <h1>📸 DEON Instagram Poster Generator</h1>
        <p>Edit content · choose fonts · adjust positions · download PNG</p>

        <div className="layout">

          {/* ══ CONTROL PANEL ══ */}
          <div className="cp">
            <div className="cp-title">✏️ &nbsp;Poster Editor</div>

            {/* Content section */}
            <div className="acc">
              <div className="acc-hdr" onClick={() => toggle('content')}>
                <span>📝 Content</span>
                <span className={`acc-arrow ${openSection === 'content' ? 'open' : ''}`}>▲</span>
              </div>
              {openSection === 'content' && (
                <div className="acc-body">
                  <div className="f">
                    <label>Product Name</label>
                    <input type="text" value={data.productName}
                      onChange={e => update('productName', e.target.value.toUpperCase())} placeholder="HELMET" />
                  </div>
                  <div className="f">
                    <label>Item Code</label>
                    <input type="text" value={data.itemCode}
                      onChange={e => update('itemCode', e.target.value.toUpperCase())} placeholder="RRGHEA220267" />
                  </div>
                  <div className="f">
                    <label>Price (₹)</label>
                    <input type="text" value={data.price}
                      onChange={e => update('price', e.target.value)} placeholder="4,500" />
                  </div>
                  <div className="fr">
                    <div className="f"><label>Size</label>
                      <input type="text" value={data.size}
                        onChange={e => update('size', e.target.value.toUpperCase())} placeholder="M" />
                    </div>
                    <div className="f"><label>Stock</label>
                      <input type="text" value={data.stock}
                        onChange={e => update('stock', e.target.value)} placeholder="1" />
                    </div>
                  </div>

                  {/* Background template — now just a thin indicator */}
                  <div className="f">
                    <label>Current Template</label>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(96,165,250,.3)', flexShrink: 0 }}>
                        <img src={data.bgImage} alt="bg" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <span style={{ fontSize: '.7rem', color: '#64748b', flex: 1 }}>Choose from Templates section below</span>
                      {data.bgImage !== DEFAULT_BG && (
                        <button
                          onClick={() => update('bgImage', DEFAULT_BG)}
                          title="Reset to default"
                          style={{
                            padding: '4px 8px', background: 'rgba(239,68,68,.12)',
                            border: '1px solid rgba(239,68,68,.25)', borderRadius: '7px',
                            color: '#f87171', cursor: 'pointer', fontSize: '.6rem',
                            display: 'flex', alignItems: 'center', gap: 4, transition: 'all .2s',
                          }}
                        >
                          <RefreshCw size={11} /> Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="f">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
                      <label style={{ marginBottom: 0 }}>Product Image</label>
                      {data.productImage && (
                        <button
                          onClick={() => update('productImage', null)}
                          title="Remove image"
                          style={{
                            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '4px',
                            color: '#f87171', cursor: 'pointer', fontSize: '.55rem', padding: '2px 6px',
                            display: 'flex', alignItems: 'center', gap: '3px', transition: 'all .2s'
                          }}
                        >
                          <Trash2 size={10} /> Remove
                        </button>
                      )}
                    </div>
                    <label className="iu" style={{ cursor: 'pointer' }}>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                      {data.productImage
                        ? <><img src={data.productImage} alt="p" /><div className="iu-ov"><Upload size={13} /> Change</div></>
                        : <div className="iu-ph"><ImageIcon size={20} /><span>Click to upload product photo</span></div>
                      }
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* ── Templates Gallery (from DB) ── */}
            <div className="acc">
              <div className="acc-hdr" onClick={() => toggle('templates')}>
                <span><LayoutGrid size={12} /> Templates</span>
                <span className={`acc-arrow ${openSection === 'templates' ? 'open' : ''}`}>▲</span>
              </div>
              {openSection === 'templates' && (
                <div className="acc-body">
                  {loadingTemplates ? (
                    <div style={{ textAlign: 'center', padding: '18px 0', color: '#3b82f6' }}>
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : (
                    <div className="tpl-grid">
                      {/* Default template */}
                      <div
                        className={`tpl-card${data.bgImage === DEFAULT_BG ? ' active' : ''}`}
                        onClick={() => update('bgImage', DEFAULT_BG)}
                      >
                        <img src={DEFAULT_BG} alt="Default" />
                        <div className="tpl-card-name">Default</div>
                      </div>

                      {/* DB templates */}
                      {dbTemplates.map(t => (
                        <div
                          key={t._id}
                          className={`tpl-card${data.bgImage === t.image ? ' active' : ''}`}
                          onClick={() => update('bgImage', t.image)}
                        >
                          <img src={t.image} alt={t.name} />
                          <div className="tpl-card-name">{t.name}</div>
                          <button
                            className="tpl-card-del"
                            onClick={e => { e.stopPropagation(); deleteTemplate(t._id); }}
                            title="Delete template"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}

                      {/* Import new */}
                      <label className="tpl-import">
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) importTemplate(f); e.target.value = ''; }}
                          disabled={importingTemplate}
                        />
                        {importingTemplate
                          ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                          : <><Plus size={18} /><span>Import</span></>
                        }
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Image position & size */}
            <div className="acc">
              <div className="acc-hdr" onClick={() => toggle('image')}>
                <span><Move size={12} /> Image Position &amp; Size</span>
                <span className={`acc-arrow ${openSection === 'image' ? 'open' : ''}`}>▲</span>
              </div>
              {openSection === 'image' && (
                <div className="acc-body">
                  <Slider label="X Pos"  min={-200} max={200} value={data.imgX}     unit="px" onChange={v => update('imgX', v)} />
                  <Slider label="Y Pos"  min={-150} max={250} value={data.imgY}     unit="px" onChange={v => update('imgY', v)} />
                  <Slider label="Scale"  min={20}   max={250} value={data.imgScale} unit="%" onChange={v => update('imgScale', v)} />
                </div>
              )}
            </div>

            {/* Text fonts, sizes & positions */}
            <div className="acc">
              <div className="acc-hdr" onClick={() => toggle('text')}>
                <span><Type size={12} /> Fonts, Sizes &amp; Positions</span>
                <span className={`acc-arrow ${openSection === 'text' ? 'open' : ''}`}>▲</span>
              </div>
              {openSection === 'text' && (
                <div className="acc-body">

                  {/* Product Name */}
                  <div className="sub-hdr">Product Name</div>
                  <FontSelect value={data.nameFont} onChange={v => update('nameFont', v)} />
                  <Slider label="Size"     min={24}  max={110} value={data.nameFontSize} unit="px" onChange={v => update('nameFontSize', v)} />
                  <Slider label="X Offset" min={-80}  max={200} value={data.nameX}       unit="px" onChange={v => update('nameX', v)} />
                  <Slider label="Y Offset" min={-60}  max={200} value={data.nameY}       unit="px" onChange={v => update('nameY', v)} />

                  {/* Item Code */}
                  <div className="sub-hdr">Item Code</div>
                  <FontSelect value={data.codeFont} onChange={v => update('codeFont', v)} />
                  <Slider label="Size"     min={8}   max={32}  value={data.codeFontSize} unit="px" onChange={v => update('codeFontSize', v)} />
                  <Slider label="X Offset" min={-30}  max={200} value={data.codeX}       unit="px" onChange={v => update('codeX', v)} />
                  <Slider label="Y Offset" min={-60}  max={100} value={data.codeY}       unit="px" onChange={v => update('codeY', v)} />

                  {/* Price */}
                  <div className="sub-hdr">Price</div>
                  <FontSelect value={data.priceFont} onChange={v => update('priceFont', v)} />
                  <Slider label="Size"     min={14}  max={60}  value={data.priceFontSize} unit="px" onChange={v => update('priceFontSize', v)} />
                  <Slider label="X Offset" min={-30}  max={200} value={data.priceX}       unit="px" onChange={v => update('priceX', v)} />
                  <Slider label="Y Offset" min={-60}  max={100} value={data.priceY}       unit="px" onChange={v => update('priceY', v)} />

                  {/* Badge values */}
                  <div className="sub-hdr">Size &amp; Stock Badges</div>
                  <FontSelect value={data.badgeFont} onChange={v => update('badgeFont', v)} />
                  <Slider label="Text Size" min={10} max={34} value={data.badgeFontSize} unit="px" onChange={v => update('badgeFontSize', v)} />
                  <Slider label="Size X" min={-40} max={40} value={data.badgeSizeX || 0} unit="px" onChange={v => update('badgeSizeX', v)} />
                  <Slider label="Size Y" min={-40} max={40} value={data.badgeSizeY || 0} unit="px" onChange={v => update('badgeSizeY', v)} />
                  <Slider label="Stock X" min={-40} max={40} value={data.badgeStockX || 0} unit="px" onChange={v => update('badgeStockX', v)} />
                  <Slider label="Stock Y" min={-40} max={40} value={data.badgeStockY || 0} unit="px" onChange={v => update('badgeStockY', v)} />

                </div>
              )}
            </div>

            {/* ── Presets ── */}
            <div className="acc">
              <div className="acc-hdr" onClick={() => toggle('presets')}>
                <span><BookmarkPlus size={12} /> Presets</span>
                <span className={`acc-arrow ${openSection === 'presets' ? 'open' : ''}`}>▲</span>
              </div>
              {openSection === 'presets' && (
                <div className="acc-body">
                  <div className="preset-save-row">
                    <input
                      placeholder="Preset name (e.g. Helmet Blue)…"
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && savePreset()}
                    />
                    <button
                      className="btn-save-preset"
                      onClick={savePreset}
                      disabled={!presetName.trim()}
                    >
                      <BookmarkPlus size={13} /> Save
                    </button>
                  </div>

                  <div className="preset-list">
                    {presets.length === 0 ? (
                      <div className="preset-empty">No presets saved yet</div>
                    ) : (
                      presets.map(p => (
                        <div key={p.id} className="preset-item">
                          <div className="preset-info">
                            <div className="preset-name">{p.name}</div>
                            <div className="preset-date">
                              {new Date(p.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                            </div>
                          </div>
                          <div className="preset-actions">
                            <button className="btn-load" onClick={() => loadPreset(p)}>Load</button>
                            <button className="btn-del" onClick={() => deletePreset(p.id)}><Trash2 size={12} /></button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="acts">
              <button className="btn-d" onClick={handleDownload} disabled={generating || !h2cReady}>
                <Download size={15} />
                {generating ? 'Generating…' : !h2cReady ? 'Loading…' : 'Download PNG'}
              </button>
              <button className="btn-r" onClick={() => setData(DEFAULT)} title="Reset all">
                <RefreshCw size={14} />
              </button>
            </div>
            <p className="note">Downloads as 1080 × 1080 px · Instagram ready</p>
          </div>

          {/* ══ LIVE POSTER ══ */}
          <div className="pw">
            <div className="pw-lbl">Live Preview — 1080×1080 shown at 50%</div>

            <div ref={posterRef} className="poster">

              {/* Background template */}
              <img src={data.bgImage} alt="poster background" className="poster-bg" crossOrigin="anonymous" />

              {/* Product Name */}
              <div className="ov" style={{
                fontFamily:  data.nameFont,
                fontSize:    `${data.nameFontSize}px`,
                top:         `${108 + data.nameY}px`,
                left:        `${18  + data.nameX}px`,
                fontWeight:  data.nameFont.includes('Narrow') || data.nameFont.includes('Extended') ? 300 : 800,
                color:       '#0d1a36',
                lineHeight:  '.87',
                letterSpacing: '.5px',
                textTransform: 'uppercase',
                maxWidth:    '238px',
                wordBreak:   'break-word',
              }}>
                {data.productName || 'PRODUCT'}
              </div>

              {/* Item Code */}
              <div className="ov" style={{
                fontFamily:  data.codeFont,
                fontSize:    `${data.codeFontSize}px`,
                top:         `${264 + data.codeY}px`,
                left:        `${18  + data.codeX}px`,
                fontWeight:  data.codeFont.includes('Narrow') || data.codeFont.includes('Extended') ? 300 : 800,
                color:       '#0d1a36',
                letterSpacing: '.2px',
                lineHeight:  '1.2',
              }}>
                {data.itemCode || '—'}
              </div>

              {/* Price */}
              <div className="ov" style={{
                fontFamily:  data.priceFont,
                fontSize:    `${data.priceFontSize}px`,
                top:         `${306 + data.priceY}px`,
                left:        `${18  + data.priceX}px`,
                fontWeight:  data.priceFont.includes('Narrow') || data.priceFont.includes('Extended') ? 300 : 900,
                color:       '#0d1a36',
                letterSpacing: '-1px',
                lineHeight:  '1',
              }}>
                ₹{data.price || '0'}
              </div>

              {/* Size badge value */}
              <div className="ov" style={{
                fontFamily:  data.badgeFont,
                fontSize:    `${data.badgeFontSize}px`,
                top:         `${398 + (data.badgeSizeY || 0)}px`,
                left:        `${57 + (data.badgeSizeX || 0)}px`,
                fontWeight:  900, color: '#0d1a36', lineHeight: '1',
              }}>
                {data.size || '—'}
              </div>

              {/* Stock badge value */}
              <div className="ov" style={{
                fontFamily:  data.badgeFont,
                fontSize:    `${data.badgeFontSize}px`,
                top:         `${398 + (data.badgeStockY || 0)}px`,
                left:        `${158 + (data.badgeStockX || 0)}px`,
                fontWeight:  900, color: '#0d1a36', lineHeight: '1',
              }}>
                {data.stock || '0'}
              </div>

              {/* Product photo */}
              {data.productImage ? (
                <img
                  src={data.productImage}
                  alt={data.productName}
                  style={{
                    position: 'absolute',
                    top:      `${38  + data.imgY}px`,
                    left:     `${270 + data.imgX}px`,
                    width:    `${260 * data.imgScale / 100}px`,
                    height:   `${310 * data.imgScale / 100}px`,
                    objectFit: 'contain',
                    zIndex: 10,
                    filter: 'drop-shadow(0 10px 28px rgba(0,0,0,.26))',
                  }}
                />
              ) : (
                <div className="ov-prod-ph" style={{ top: '72px', right: '18px', width: '230px', height: '270px' }}>
                  <ImageIcon size={34} />
                  <span>Upload product image</span>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </>
  );
}
