'use client';

import { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Upload, Search, Image as ImageIcon, Download, RefreshCw, Trash2, FileQuestion, Save, Camera, FileText, ImagePlus, Cloud, CheckCircle } from 'lucide-react';

interface DisplayItem {
  id: number;
  code: string;
  mrp: string;
  size: string;
  stock: number;
  image: string;
  originalDesc: string;
  originalPartNo: string;
}

export default function DeonStockApp() {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debugMsg, setDebugMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 1. LOAD DATA FROM MONGODB ON STARTUP ---
  useEffect(() => {
    fetchItems();
    const savedBanner = localStorage.getItem('deon_banner_img');
    if (savedBanner) setBannerImage(savedBanner);
  }, []);

  const fetchItems = async () => {
    setDebugMsg('Loading from Database...');
    try {
      const res = await fetch('/api/stock');
      if (res.ok) {
        const data = await res.json();
        setItems(data);
        setDebugMsg('');
      } else {
        setDebugMsg('Failed to load data.');
      }
    } catch (error) {
      console.error(error);
      setDebugMsg('Connection Error.');
    }
  };

  // --- 2. SAVE TO MONGODB HELPER ---
  const saveToCloud = async (newItems: DisplayItem[]) => {
      setIsSaving(true);
      setDebugMsg('Saving to Cloud...');
      try {
          await fetch('/api/stock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newItems)
          });
          setDebugMsg('Saved!');
          setTimeout(() => setDebugMsg(''), 2000);
      } catch (err) {
          console.error(err);
          setDebugMsg('Save Failed!');
      } finally {
          setIsSaving(false);
      }
  };

  // --- HELPER: Safely extract text ---
  const getSafeValue = (cell: ExcelJS.Cell): string => {
    if (!cell || cell.value === null || cell.value === undefined) return '';
    if (typeof cell.value === 'object' && 'richText' in cell.value) {
       return cell.value.richText.map((t) => t.text).join('');
    }
    if (typeof cell.value === 'object' && 'result' in cell.value) {
       return String(cell.value.result);
    }
    if (typeof cell.value === 'object' && 'text' in cell.value) {
       return String(cell.value.text);
    }
    return String(cell.value);
  };

  const processExcelData = async (buffer: ArrayBuffer) => {
    setIsProcessing(true);
    setDebugMsg('Processing File...');
    
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      
      let targetWorksheet: ExcelJS.Worksheet | null = null;
      let headerRowIndex = -1;
      let colMap = { desc: -1, part: -1, stock: -1, size: -1 };
      
      for (const worksheet of workbook.worksheets) {
          if (targetWorksheet) break;
          worksheet.eachRow((row, rowNumber) => {
            if (headerRowIndex !== -1 || rowNumber > 30) return;
            const safeRowValues: string[] = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                 safeRowValues[colNumber] = getSafeValue(cell).toLowerCase().trim().replace(/[*]/g, '').trim(); 
            });

            const pIndex = safeRowValues.findIndex(c => c && (c.includes('part') || c.includes('code') || c.includes('item') || c.includes('mrp')));
            const sIndex = safeRowValues.findIndex(c => c && (c.includes('stock') || c.includes('qty') || c.includes('quantity') || c.includes('bal')));
            
            let dIndex = safeRowValues.findIndex(c => c && (c.includes('description') || c.includes('desc')));
            if (dIndex === -1) {
                dIndex = safeRowValues.findIndex(c => c && (c.includes('name') || c.includes('particulars')));
            }

            const zIndex = safeRowValues.findIndex(c => c === 'size' || c === 'sz');

            if ((pIndex !== -1 || dIndex !== -1) && sIndex !== -1) {
              headerRowIndex = rowNumber;
              colMap = { desc: dIndex, part: pIndex, stock: sIndex, size: zIndex };
              targetWorksheet = worksheet;
            }
          });
      }

      if (!targetWorksheet) {
           const ws = workbook.worksheets[0];
           if (ws && ws.rowCount > 1) {
               targetWorksheet = ws;
               headerRowIndex = 1;
               colMap = { part: 1, desc: 2, stock: 6, size: -1 }; 
               const val6 = getSafeValue(ws.getRow(2).getCell(6));
               if (!val6.match(/[0-9]/)) colMap.stock = 7;
           }
      }

      if (!targetWorksheet) {
        setDebugMsg('Could not read file headers.');
        setIsProcessing(false);
        return;
      }

      const imageMap: Record<number, string> = {};
      for (const image of targetWorksheet.getImages()) {
        const imgId = image.imageId;
        // FIX: Cast 'm' to any to avoid TypeScript error
        const imgData = workbook.model.media.find((m: any) => m.index === Number(imgId));
        if (imgData) {
            const rowIndex = Math.floor(image.range.tl.nativeRow) + 1;
            const base64 = `data:${imgData.type};base64,${Buffer.from(imgData.buffer).toString('base64')}`;
            imageMap[rowIndex] = base64;
        }
      }

      const newItems: DisplayItem[] = [];
      targetWorksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowIndex) return;

        const getVal = (idx: number) => {
           if (idx === -1) return '';
           return getSafeValue(row.getCell(idx)).trim();
        };

        const rawPartNo = colMap.part !== -1 ? getVal(colMap.part) : getVal(colMap.desc);
        const rawStockStr = colMap.stock !== -1 ? getVal(colMap.stock) : '0';
        const rawStock  = parseFloat(rawStockStr.replace(/[^0-9.-]/g, '')) || 0;
        const rawDesc = colMap.desc !== -1 ? getVal(colMap.desc) : '';
        const rawSizeCol= colMap.size !== -1 ? getVal(colMap.size) : '';

        if (!rawPartNo && rawStock === 0) return;

        let code = rawPartNo;
        let mrp = '';
        if (rawPartNo && rawPartNo.toUpperCase().includes('MRP')) {
            const mrpMatch = rawPartNo.match(/MRP[\.\-\s:：]?(\d+)/i);
            if (mrpMatch) {
                mrp = mrpMatch[1];
                code = rawPartNo.replace(mrpMatch[0], '').replace(/[\(\)-]/g, '').trim();
            }
        }
        if (!mrp && rawPartNo.includes('(')) {
             const parenMatch = rawPartNo.match(/\((\d{3,})\)/);
             if (parenMatch) {
                 mrp = parenMatch[1];
                 code = rawPartNo.replace(parenMatch[0], '').trim();
             }
        }

        let size = rawSizeCol;
        if (!size || size === '-' || size === '') {
            const descToSearch = rawDesc || rawPartNo; 
            const sizeMatch = descToSearch.match(/\((S|M|L|XL|XXL|XS|2XL)\)/i);
            size = sizeMatch ? sizeMatch[1].toUpperCase() : '-';
        }

        newItems.push({
          id: rowNumber, 
          code: code || "Unknown",
          mrp: mrp,
          size: size,
          stock: rawStock,
          image: imageMap[rowNumber] || '',
          originalDesc: rawDesc,
          originalPartNo: rawPartNo
        });
      });

      // MERGE LOGIC
      let mergedItems = [...items];
      newItems.forEach(newItem => {
          const existingIndex = mergedItems.findIndex(old => old.code.toLowerCase() === newItem.code.toLowerCase());
          if (existingIndex !== -1) {
              mergedItems[existingIndex].stock = newItem.stock;
              if (newItem.image) mergedItems[existingIndex].image = newItem.image; 
          } else {
              mergedItems.push({ ...newItem, id: mergedItems.length + 1 });
          }
      });
      
      setItems(mergedItems);
      saveToCloud(mergedItems); // SAVE TO DB
      setIsProcessing(false);

    } catch (err: any) {
      console.error(err);
      setDebugMsg('Error: ' + err.message);
      setIsProcessing(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const exportItems = items.filter(item => item.stock > 0);

    if (exportItems.length === 0) {
        alert("No items with stock > 0 to export!");
        return;
    }

    doc.setTextColor(30, 100, 200); 
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text("DEON AUTO ACCESSORIES", 14, 20);
    
    doc.setDrawColor(30, 100, 200);
    doc.setLineWidth(0.5);
    doc.line(14, 22, 110, 22);

    let startY = 30;

    if (bannerImage) {
        doc.addImage(bannerImage, 'JPEG', 14, 25, 180, 40); 
        startY = 70; 
    }

    const tableBody = exportItems.map((item, index) => [
        index + 1,
        `${item.code}${item.mrp ? ` (${item.mrp})` : ''}`,
        '', 
        item.size,
        item.stock
    ]);

    autoTable(doc, {
        startY: startY,
        head: [['NO', 'ITEM CODE/MRP', 'PICTURE', 'SIZE', 'STOCK']],
        body: tableBody,
        showHead: 'firstPage',
        rowPageBreak: 'avoid',
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255], 
            textColor: [0, 0, 0], 
            fontStyle: 'bold',
            lineWidth: 0.1,
            lineColor: [0, 0, 0]
        },
        styles: {
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            valign: 'middle',
            fontSize: 12,
            cellPadding: 2,
            minCellHeight: 33 
        },
        columnStyles: {
            0: { cellWidth: 15, halign: 'center' },
            1: { cellWidth: 70, fontStyle: 'bold' },
            2: { cellWidth: 40, halign: 'center' },
            3: { cellWidth: 20, halign: 'center' },
            4: { 
                cellWidth: 25, 
                halign: 'center', 
                fontStyle: 'bold',
            }
        },
        didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index === 2) {
                const item = exportItems[data.row.index];
                if (item && item.image) {
                    try {
                         const padding = 4;
                         const maxImgHeight = data.cell.height - padding;
                         const maxImgWidth = data.cell.width - padding;
                         const imgDim = Math.min(maxImgHeight, maxImgWidth);
                         const xOffset = (data.cell.width - imgDim) / 2;
                         const yOffset = (data.cell.height - imgDim) / 2;
                         doc.addImage(item.image, 'JPEG', data.cell.x + xOffset, data.cell.y + yOffset, imgDim, imgDim);
                    } catch (e) { }
                }
            }
        }
    });

    doc.save(`Deon_Stock_List.pdf`);
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              const res = ev.target?.result as string;
              setBannerImage(res);
              localStorage.setItem('deon_banner_img', res); // Banner stays local for now
          };
          reader.readAsDataURL(file);
      }
  };

  const handleImageUpload = (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              const newImg = ev.target?.result as string;
              const newItems = items.map(item => item.id === id ? { ...item, image: newImg } : item);
              setItems(newItems);
              saveToCloud(newItems); // SAVE TO DB
          };
          reader.readAsDataURL(file);
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => e.target?.result && processExcelData(e.target.result as ArrayBuffer);
        reader.readAsArrayBuffer(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearData = async () => {
      if(confirm("Are you sure you want to clear all data from the database?")) {
          setItems([]);
          saveToCloud([]); // CLEARS DB
          localStorage.removeItem('deon_banner_img');
          setBannerImage(null);
      }
  };

  const handleStockChange = (id: number, val: string) => {
    const newStock = parseFloat(val);
    const updatedItems = items.map(item => item.id === id ? { ...item, stock: isNaN(newStock) ? 0 : newStock } : item);
    setItems(updatedItems);
    
    // Debounce save (wait 1 sec before saving to avoid spamming DB)
    const timeoutId = setTimeout(() => saveToCloud(updatedItems), 1000);
    return () => clearTimeout(timeoutId);
  };

  const handleExport = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stock');
    ws.addRow(['Description', 'PartNo', 'Stock']); 
    items.forEach(item => {
        ws.addRow([item.originalDesc, item.originalPartNo, item.stock]);
    });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Updated_Stock.xlsx';
    a.click();
  };

  const filtered = items.filter(i => 
    i.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.originalDesc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white text-black font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 border-b-4 border-blue-600 pb-4">
          <div className="flex justify-between items-start">
             <div>
                <h1 className="text-3xl md:text-4xl font-extrabold text-blue-600 italic uppercase tracking-tighter">
                    DEON AUTO ACCESSORIES
                </h1>
                <p className="text-xs text-gray-500 font-mono mt-1">CLOUD SYNC ACTIVE</p>
             </div>
             {(debugMsg || isProcessing || isSaving) && (
                <div className="px-4 py-2 bg-blue-50 text-blue-700 text-sm rounded flex items-center gap-2 font-bold shadow-sm">
                    {isProcessing || isSaving ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                    {debugMsg || "Ready"}
                </div>
             )}
          </div>
          
          <div className="mt-6 flex flex-col md:flex-row gap-4 items-center">
            <div className="flex gap-2">
              <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 cursor-pointer h-10 transition-active active:scale-95">
                <Upload size={18} /> <span className="font-bold text-sm">Update</span>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx" />
              </label>

              <label className={`flex items-center gap-2 px-4 py-2 rounded shadow h-10 cursor-pointer ${bannerImage ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                <ImagePlus size={18} /> <span className="font-bold text-sm">{bannerImage ? 'Banner' : 'Banner'}</span>
                <input type="file" onChange={handleBannerUpload} className="hidden" accept="image/*" />
              </label>
              
              {items.length > 0 && (
                <>
                  <button onClick={handleExport} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 h-10 transition-active active:scale-95">
                    <Download size={18} /> <span className="font-bold text-sm">Excel</span>
                  </button>
                  <button onClick={handleExportPDF} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700 h-10 transition-active active:scale-95">
                    <FileText size={18} /> <span className="font-bold text-sm">PDF</span>
                  </button>
                </>
              )}

              {items.length > 0 && (
                  <button onClick={handleClearData} className="flex items-center gap-2 bg-gray-200 text-gray-600 px-4 py-2 rounded shadow hover:bg-gray-300 h-10">
                      <Trash2 size={18} />
                  </button>
              )}
            </div>
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 h-10 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </header>

        <div className="border border-black overflow-hidden rounded-sm shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white text-black text-sm font-bold border-b border-black">
                <th className="p-3 border-r border-black w-12 text-center">NO</th>
                <th className="p-3 border-r border-black w-1/3 text-center">ITEM CODE/MRP</th>
                <th className="p-3 border-r border-black text-center">PICTURE</th>
                <th className="p-3 border-r border-black w-16 text-center">SIZE</th>
                <th className="p-3 text-center w-24 border-l border-black">STOCK</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map((item, index) => (
                <tr key={item.id} className="border-b border-black text-center h-24 hover:bg-gray-50 transition-colors">
                  <td className="p-2 border-r border-black font-bold">{index + 1}</td>
                  <td className="p-2 border-r border-black font-bold text-lg">
                    {item.code} <br/> <span className="text-gray-600 text-base font-normal">{item.mrp ? `(${item.mrp})` : ''}</span>
                  </td>
                  <td className="p-2 border-r border-black relative group">
                    <div className="flex justify-center items-center h-20 w-20 mx-auto cursor-pointer relative overflow-hidden rounded">
                        <label className="w-full h-full flex items-center justify-center cursor-pointer">
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(item.id, e)} />
                            {item.image ? (
                               <img src={item.image} alt="Pic" className="max-h-20 max-w-20 object-contain" />
                            ) : (
                               <div className="flex flex-col items-center justify-center h-20 w-20 bg-gray-50 border border-gray-100 text-gray-300 hover:bg-gray-100 hover:text-gray-500">
                                   <ImageIcon size={30} />
                                   <span className="text-[10px] mt-1">Add</span>
                               </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                <Camera size={20} />
                            </div>
                        </label>
                    </div>
                  </td>
                  <td className="p-2 border-r border-black font-bold text-lg">{item.size}</td>
                  <td className="p-0 font-extrabold text-xl relative">
                    <input 
                        type="number" 
                        defaultValue={item.stock}
                        onBlur={(e) => handleStockChange(item.id, e.target.value)}
                        className="w-full h-full text-center font-extrabold text-xl focus:bg-gray-50 outline-none p-2 bg-white" 
                    />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-gray-400">
                    <div className="flex flex-col items-center opacity-50">
                        <FileQuestion size={48} />
                        <p className="mt-2">{items.length === 0 ? "Database is empty." : "No items found."}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}