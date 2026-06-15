'use client';

import { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Upload, Search, Image as ImageIcon, Download, RefreshCw, Trash2, FileQuestion, Save, Camera, FileText, CheckCircle, Shield, BadgeCheck, Bike, Wind, MapPin, Phone, Truck } from 'lucide-react';

interface DisplayItem {
  id: number;
  code: string;
  mrp: string;
  size: string;
  stock: number;
  image: string;
  originalDesc: string;
  originalPartNo: string;
  brand?: 'RE' | 'AXXIS'; 
}

export default function DeonStockApp() {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeBrand, setActiveBrand] = useState<'RE' | 'AXXIS'>('RE'); 
  const [debugMsg, setDebugMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [topHeadImage, setTopHeadImage] = useState<string | null>(null);
  const [reTopHeadImage, setReTopHeadImage] = useState<string | null>(null);
  const [bottomHeadImage, setBottomHeadImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 1. LOAD DATA ---
  useEffect(() => {
    fetchItems();

    // Pre-load AXXIS top-head image
    fetch('/axxis/top-head.png')
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => setTopHeadImage(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => console.warn('Top head image not found'));

    // Pre-load RE top-head image
    fetch('/axxis/re-top-head.png')
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => setReTopHeadImage(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => console.warn('RE Top head image not found'));

    // Pre-load bottom-head image as base64 for PDF export
    fetch('/axxis/bottom-head.png')
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => setBottomHeadImage(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => console.warn('Bottom head image not found'));
  }, []);

  const fetchItems = async () => {
    setDebugMsg('Loading Database...');
    try {
      const res = await fetch('/api/stock');
      if (res.ok) {
        const data = await res.json();
        
        // --- BULLETPROOF OVERRIDE ADDED HERE ---
        const patchedData = data.map((item: DisplayItem) => {
          const desc = item.originalDesc || '';
          const code = item.code || '';
          const isAxxis = desc.toLowerCase().includes('axxis') || code.toLowerCase().startsWith('ax');
          
          let correctBrand = item.brand || 'RE';
          if (isAxxis) correctBrand = 'AXXIS';

          return {
            ...item,
            brand: correctBrand
          };
        });

        setItems(patchedData);
        setDebugMsg('');
      } else {
        setDebugMsg('Failed to load.');
      }
    } catch (error) {
      console.error(error);
      setDebugMsg('Connection Error.');
    }
  };

  const saveToCloud = async (newItems: DisplayItem[]) => {
      setIsSaving(true);
      setDebugMsg('Saving...');
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

  const getSafeValue = (cell: ExcelJS.Cell): string => {
    if (!cell || cell.value === null || cell.value === undefined) return '';
    if (typeof cell.value === 'object' && 'richText' in cell.value) {
       return (cell.value as any).richText.map((t: any) => t.text).join('');
    }
    if (typeof cell.value === 'object' && 'result' in cell.value) {
       return String((cell.value as any).result);
    }
    if (typeof cell.value === 'object' && 'text' in cell.value) {
       return String((cell.value as any).text);
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
            if (dIndex === -1) dIndex = safeRowValues.findIndex(c => c && (c.includes('name') || c.includes('particulars')));
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
        const getVal = (idx: number) => idx === -1 ? '' : getSafeValue(row.getCell(idx)).trim();

        const rawPartNo = colMap.part !== -1 ? getVal(colMap.part) : getVal(colMap.desc);
        const rawStockStr = colMap.stock !== -1 ? getVal(colMap.stock) : '0';
        const rawStock  = parseFloat(rawStockStr.replace(/[^0-9.-]/g, '')) || 0;
        const rawDesc = colMap.desc !== -1 ? getVal(colMap.desc) : '';
        const rawSizeCol= colMap.size !== -1 ? getVal(colMap.size) : '';

        if (!rawPartNo && rawStock === 0) return;

        let code = rawPartNo;
        let mrp = '';
        if (rawPartNo && rawPartNo.toUpperCase().includes('MRP')) {
            const mrpMatch = rawPartNo.match(/MRP[.\-\s:：]?(\d+)/i);
            if (mrpMatch) {
                mrp = mrpMatch[1];
                code = rawPartNo.replace(mrpMatch[0], '').replace(/[()\\-]/g, '').trim();
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

        const detectedBrand = activeBrand;

        newItems.push({
          id: rowNumber, 
          code: code || "Unknown",
          mrp: mrp,
          size: size,
          stock: rawStock,
          image: imageMap[rowNumber] || '',
          originalDesc: rawDesc,
          originalPartNo: rawPartNo,
          brand: detectedBrand 
        });
      });

      setItems(prevItems => {
          let mergedItems = [...prevItems];
          
          newItems.forEach(newItem => {
              const existingIndex = mergedItems.findIndex(old => old.code.toLowerCase() === newItem.code.toLowerCase());
              if (existingIndex !== -1) {
                  mergedItems[existingIndex] = {
                      ...mergedItems[existingIndex],
                      stock: newItem.stock,
                      brand: newItem.brand,
                      image: newItem.image ? newItem.image : mergedItems[existingIndex].image
                  };
              } else {
                  mergedItems.push({ ...newItem, id: mergedItems.length + 1 });
              }
          });

          setTimeout(() => saveToCloud(mergedItems), 0);
          return mergedItems;
      });
      
      setIsProcessing(false);

    } catch (err: any) {
      console.error(err);
      setDebugMsg('Error: ' + err.message);
      setIsProcessing(false);
    }
  };

  const handleExportExcel = async () => {
    const exportItems = items.filter(item => (item.brand || 'RE') === activeBrand && item.stock > 0);
    if (exportItems.length === 0) {
        alert(`No ${activeBrand} items with stock > 0!`);
        return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stock List');

    ws.mergeCells('A1:E1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `DEON AUTO ACCESSORIES - ${activeBrand}`;
    titleCell.font = { name: 'Helvetica', size: 16, bold: true, color: { argb: 'FF1E64C8' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 30;

    const headerRow = ws.getRow(2);
    headerRow.values = ['NO', 'ITEM CODE/MRP', 'PICTURE', 'SIZE', 'STOCK'];
    headerRow.height = 25;
    
    const borderStyle: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
    };

    headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 12 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = borderStyle;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    });

    ws.getColumn(1).width = 8;   
    ws.getColumn(2).width = 40;  
    ws.getColumn(3).width = 22;  
    ws.getColumn(4).width = 12;  
    ws.getColumn(5).width = 12;  

    let currentRow = 3;
    exportItems.forEach((item, index) => {
        const row = ws.getRow(currentRow);
        row.values = [
            index + 1,
            `${item.code}${item.mrp ? ` (${item.mrp})` : ''}`,
            '', 
            item.size,
            item.stock
        ];
        row.height = 105;
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.font = { size: 12 };
            cell.border = borderStyle;
        });

        row.getCell(2).font = { bold: true, size: 12 };

        if (item.image) {
            const imageId = wb.addImage({
                base64: item.image,
                extension: 'png',
            });
            ws.addImage(imageId, {
                tl: { col: 2.3, row: currentRow - 1 + 0.1 }, 
                ext: { width: 100, height: 100 }, 
                editAs: 'oneCell' 
            });
        }
        currentRow++;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Deon_${activeBrand}_Stock.xlsx`;
    a.click();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const exportItems = items.filter(item => (item.brand || 'RE') === activeBrand && item.stock > 0);

    if (exportItems.length === 0) { alert(`No ${activeBrand} items to export!`); return; }

    // Brand-specific theme variables
    const isRE = activeBrand === 'RE';
    const primaryColor = isRE ? [198, 32, 32] : [12, 50, 140]; // Red for RE, Dark Blue for AXXIS
    const headerTitle2 = isRE ? 'ITEM CODE / MRP' : 'ITEM CODE / MODEL';

    let startY = 10;

    const activeTopHead = isRE ? reTopHeadImage : topHeadImage;

    // Add top-head image as PDF header
    if (activeTopHead) {
      // Based on 1080x500 aspect ratio from the original image
      const imgHeight = pageWidth * (500 / 1080);
      doc.addImage(activeTopHead, 'PNG', 0, 0, pageWidth, imgHeight);
      startY = imgHeight + 3;
    } else {
      doc.setTextColor(30, 100, 200); 
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(`DEON ${activeBrand} STOCK`, 14, 20);
      doc.setDrawColor(30, 100, 200);
      doc.setLineWidth(0.5);
      doc.line(14, 22, 110, 22);
      startY = 30;
    }

    // Table margins
    const marginLeft = 10;
    const tableWidth = pageWidth - marginLeft * 2;

    // Column widths proportional to reference design
    const colWidths = {
      no: 15,
      code: 60,
      pic: 51,
      size: 32,
      stock: 32,
    };

    // Build table body — text content is drawn custom, so use empty strings
    const tableBody = exportItems.map(() => ['', '', '', '', '']);

    autoTable(doc, {
        startY: startY,
        margin: { top: 15, left: marginLeft, right: marginLeft, bottom: 25 },
        head: [['NO', headerTitle2, 'PICTURE', 'SIZE', 'STOCK']],
        body: tableBody,
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        theme: 'plain',

        headStyles: {
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 10,
            halign: 'center',
            valign: 'middle',
            cellPadding: { top: 8, bottom: 8, left: 2, right: 2 },
        },

        bodyStyles: {
            minCellHeight: 40,
        },

        styles: {
            textColor: [0, 0, 0],
            valign: 'middle',
            fontSize: 10,
            cellPadding: 3,
        },

        columnStyles: {
            0: { cellWidth: colWidths.no, halign: 'center' },
            1: { cellWidth: colWidths.code },
            2: { cellWidth: colWidths.pic, halign: 'center' },
            3: { cellWidth: colWidths.size, halign: 'center' },
            4: { cellWidth: colWidths.stock, halign: 'center' },
        },

        didParseCell: (data) => {
            if (data.section === 'head') {
                if (data.column.index === 0 || data.column.index === 4) {
                    data.cell.styles.fillColor = primaryColor as any; // Dynamic brand color
                } else {
                    data.cell.styles.fillColor = [18, 18, 18]; // Black
                }
            }
        },

        didDrawPage: (data) => {
            // Apply rounded corners
            const pageStartY = data.pageNumber === 1 ? startY : 15;
            const pageEndY = data.cursor ? data.cursor.y : 0;
            if (!pageEndY) return;

            const r = 3; // Corner radius for top header

            // 1. Mask sharp corners with white squares
            doc.setFillColor(255, 255, 255);
            doc.rect(marginLeft, pageStartY, r, r, 'F'); // Top-Left
            doc.rect(marginLeft + tableWidth - r, pageStartY, r, r, 'F'); // Top-Right
            
            // Nip bottom sharp borders slightly
            doc.rect(marginLeft - 0.5, pageEndY - 1, 1.5, 1.5, 'F'); // Bottom-Left
            doc.rect(marginLeft + tableWidth - 1, pageEndY - 1, 1.5, 1.5, 'F'); // Bottom-Right

            // 2. Restore top corners with brand color circles (to match header color)
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.circle(marginLeft + r, pageStartY + r, r, 'F'); // Top-Left
            doc.circle(marginLeft + tableWidth - r, pageStartY + r, r, 'F'); // Top-Right
        },

        didDrawCell: (data) => {
            if (data.section !== 'body' && data.section !== 'head') return;
            const x = data.cell.x;
            const y = data.cell.y;
            const w = data.cell.width;
            const h = data.cell.height;

            // --- DRAW BORDERS MANUALLY ---
            if (data.section === 'head') {
                if (data.column.index < 4) {
                    doc.setDrawColor(40, 40, 40);
                    doc.setLineWidth(0.2);
                    doc.line(x + w, y, x + w, y + h); // Vertical divider
                }
            } else if (data.section === 'body') {
                doc.setDrawColor(220, 225, 230); // light gray
                doc.setLineWidth(0.4);
                doc.line(x, y + h, x + w, y + h); // Bottom border
                if (data.column.index < 4) {
                    doc.line(x + w, y, x + w, y + h); // Vertical divider
                }
                if (data.column.index === 0) {
                    doc.line(x, y, x, y + h); // Outer left border
                }
                if (data.column.index === 4) {
                    doc.line(x + w, y, x + w, y + h); // Outer right border
                }
            }

            if (data.section !== 'body') return;
            const item = exportItems[data.row.index];
            if (!item) return;

            const centerX = x + w / 2;
            const centerY = y + h / 2;

            // Column 0: NO — Brand colored rounded badge with number + line/dot
            if (data.column.index === 0) {
                const badgeSize = 9;
                const badgeX = centerX - badgeSize / 2;
                const badgeY = centerY - badgeSize / 2 - 4;
                const r = 1.5;

                // Draw rounded badge
                doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, r, r, 'F');

                // Number in white
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(9.5);
                doc.setFont('helvetica', 'bold');
                doc.text(String(data.row.index + 1), centerX, badgeY + badgeSize / 2 + 0.5, { align: 'center', baseline: 'middle' });

                // Line with dot below badge
                const arrowTop = badgeY + badgeSize + 2;
                doc.setDrawColor(20, 20, 20);
                doc.setLineWidth(0.6);
                doc.line(centerX, arrowTop, centerX, arrowTop + 6);
                
                doc.setFillColor(20, 20, 20);
                doc.circle(centerX, arrowTop + 6, 0.8, 'F');
            }

            // Column 1: ITEM CODE / MODEL — Bold code, conditional desc, price, conditional underline
            if (data.column.index === 1) {
                const textX = x + 4;
                const maxW = w - 8;
                let textY = y + 8; // Start slightly higher to accommodate multiple lines

                // Item code (black bold)
                doc.setTextColor(15, 23, 42);
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                let codeText = item.code || '';
                let codeLines = doc.splitTextToSize(codeText, maxW);
                if (codeLines.length > 2) {
                    codeLines = codeLines.slice(0, 2);
                    codeLines[1] = codeLines[1].substring(0, codeLines[1].length - 3) + '...';
                }
                doc.text(codeLines, textX, textY);
                textY += codeLines.length * 4.5;

                // Description (AXXIS only: BLUE bold)
                if (!isRE && item.originalDesc) {
                    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]); 
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    let desc = item.originalDesc.toUpperCase();
                    let descLines = doc.splitTextToSize(desc, maxW);
                    if (descLines.length > 2) {
                        descLines = descLines.slice(0, 2);
                        descLines[1] = descLines[1].substring(0, descLines[1].length - 3) + '...';
                    }
                    doc.text(descLines, textX, textY + 1.5);
                    textY += descLines.length * 4 + 1.5;
                }

                // Price (Brand color)
                if (item.mrp) {
                    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                    doc.setFontSize(10.5);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`(Rs. ${item.mrp})`, textX, textY + 1.5);
                    textY += 4.5;
                }

                // Small underline (Silver for RE, Blue for AXXIS)
                if (isRE) {
                    doc.setDrawColor(200, 204, 210); // Silver
                } else {
                    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]); // Blue
                }
                doc.setLineWidth(1.2);
                doc.line(textX, textY + 2, textX + 16, textY + 2);
            }

            // Column 2: PICTURE — centered, properly sized
            if (data.column.index === 2 && item.image) {
                try {
                    const imgSize = Math.min(h - 6, w - 8, 35);
                    const imgX = centerX - imgSize / 2;
                    const imgY = centerY - imgSize / 2;
                    doc.addImage(item.image, 'JPEG', imgX, imgY, imgSize, imgSize);
                } catch (e) { }
            }

            if (data.column.index === 3) {
                doc.setTextColor(15, 23, 42);
                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                doc.text(item.size || '-', centerX, centerY + 1, { align: 'center', baseline: 'middle' });
            }

            if (data.column.index === 4) {
                doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.setFontSize(24);
                doc.setFont('helvetica', 'bold');
                doc.text(String(item.stock), centerX, centerY + 1, { align: 'center', baseline: 'middle' });
            }
        }
    });

    // ── Bottom image bar (if there's space on last page) ──
    const finalY = (doc as any).lastAutoTable?.finalY || 0;
    
    if (bottomHeadImage) {
        // Assume bottom image aspect ratio is roughly 1900 x 200 (or similar banner proportion)
        // We will make it full width of the table.
        const footerHeight = tableWidth * (200 / 1900); // adjust based on actual aspect ratio if needed, let's use 20 for safety
        
        if (finalY + 30 < pageHeight) {
            // Draw image
            doc.addImage(bottomHeadImage, 'PNG', marginLeft, finalY + 6, tableWidth, 20);
        } else {
            // Add a new page just for the footer if it doesn't fit
            doc.addPage();
            if (topHeadImage) {
                doc.addImage(topHeadImage, 'PNG', 0, 0, pageWidth, 45);
            }
            doc.addImage(bottomHeadImage, 'PNG', marginLeft, 55, tableWidth, 20);
        }
    }

    doc.save(`Deon_${activeBrand}_Stock.pdf`);
  };

  const handleImageUpload = (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              const newImg = ev.target?.result as string;
              
              setItems(prevItems => {
                  const newItems = prevItems.map(item => 
                    item.id === id ? { ...item, image: newImg } : item
                  );
                  setTimeout(() => saveToCloud(newItems), 0);
                  return newItems;
              });
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
      if(confirm(`Clear ALL data for ${activeBrand} from cloud database?`)) {
          const remainingItems = items.filter(i => (i.brand || 'RE') !== activeBrand);
          setItems(remainingItems);
          saveToCloud(remainingItems); 
      }
  };

  const handleStockChange = (id: number, val: string) => {
    const newStock = parseFloat(val);
    const finalStock = isNaN(newStock) ? 0 : newStock;

    setItems(prevItems => {
      const updatedItems = prevItems.map(item => 
        item.id === id ? { ...item, stock: finalStock } : item
      );
      setTimeout(() => saveToCloud(updatedItems), 0);
      return updatedItems;
    });
  };

  const handleSizeChange = (id: number, val: string) => {
    const finalSize = val.trim().toUpperCase();

    setItems(prevItems => {
      const updatedItems = prevItems.map(item => 
        item.id === id ? { ...item, size: finalSize } : item
      );
      setTimeout(() => saveToCloud(updatedItems), 0);
      return updatedItems;
    });
  };

  const filtered = items.filter(i => {
    const itemBrand = i.brand || 'RE'; 
    return itemBrand === activeBrand && (
      i.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
      i.originalDesc.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const inStockCount = filtered.filter(i => i.stock > 0).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Bebas+Neue&display=swap');

        .deon-page {
          min-height: 100vh;
          background: #f0f2f5;
          font-family: 'Inter', sans-serif;
        }

        /* ── Top Header Bar ── */
        .top-header {
          background: #0a1628;
          padding: 14px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 100;
          border-bottom: 3px solid #1d4ed8;
        }
        .top-header-title {
          font-family: 'Bebas Neue', var(--font-bebas), sans-serif;
          font-size: 2.2rem;
          letter-spacing: 2px;
          color: white;
          line-height: 1;
        }
        .top-header-title span { color: #60a5fa; }
        .brand-badge {
          background: #1d4ed8;
          color: white;
          font-family: 'Bebas Neue', var(--font-bebas), sans-serif;
          font-size: 1.1rem;
          letter-spacing: 2px;
          padding: 6px 18px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .brand-badge-axxis {
          background: linear-gradient(135deg, #dc2626, #991b1b);
        }
        .cloud-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #22c55e;
          display: inline-block;
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }

        /* ── Brand Switcher ── */
        .brand-switcher {
          display: flex;
          gap: 0;
          background: rgba(255,255,255,.08);
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.1);
        }
        .brand-btn {
          padding: 8px 22px;
          font-size: .75rem;
          font-weight: 800;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          border: none;
          cursor: pointer;
          transition: all .2s;
          color: #64748b;
          background: transparent;
        }
        .brand-btn:hover { color: #94a3b8; }
        .brand-btn.active-re {
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          color: white;
          box-shadow: 0 2px 12px rgba(37,99,235,.4);
        }
        .brand-btn.active-axxis {
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          color: white;
          box-shadow: 0 2px 12px rgba(220,38,38,.4);
        }

        /* ── Hero Banner ── */
        .hero-banner {
          position: relative;
          height: 280px;
          overflow: hidden;
          background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%);
        }
        .hero-banner img {
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: .7;
        }
        .hero-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(90deg, rgba(10,22,40,.95) 0%, rgba(10,22,40,.6) 50%, rgba(10,22,40,.3) 100%);
          display: flex;
          align-items: center;
          padding: 0 40px;
        }
        .hero-left {
          flex: 1;
        }
        .hero-tagline {
          font-family: 'Bebas Neue', var(--font-bebas), sans-serif;
          font-size: 1.1rem;
          letter-spacing: 4px;
          color: #60a5fa;
          margin-bottom: 4px;
        }
        .hero-title {
          font-family: 'Bebas Neue', var(--font-bebas), sans-serif;
          font-size: 3rem;
          color: white;
          line-height: 1;
          letter-spacing: 2px;
        }
        .hero-features {
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex-shrink: 0;
        }
        .hero-feat {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255,255,255,.08);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 10px;
          padding: 10px 16px;
          min-width: 200px;
        }
        .hero-feat-icon {
          width: 32px; height: 32px;
          background: rgba(59,130,246,.2);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: #60a5fa;
          flex-shrink: 0;
        }
        .hero-feat-text {
          font-size: .7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #e2e8f0;
          line-height: 1.3;
        }
        .hero-upload-btn {
          position: absolute;
          bottom: 12px; left: 12px;
          background: rgba(0,0,0,.5);
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 8px;
          padding: 6px 12px;
          color: #94a3b8;
          font-size: .65rem;
          cursor: pointer;
          display: flex; align-items: center; gap: 5px;
          transition: all .2s;
          z-index: 5;
        }
        .hero-upload-btn:hover { background: rgba(0,0,0,.7); color: white; }

        /* ── Toolbar ── */
        .toolbar {
          background: white;
          border-bottom: 1px solid #e2e8f0;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .tool-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: .78rem;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: all .15s;
          white-space: nowrap;
        }
        .tool-btn:active { transform: scale(.96); }
        .tool-btn-primary {
          background: #1d4ed8; color: white;
        }
        .tool-btn-primary:hover { background: #1e40af; }
        .tool-btn-green {
          background: #16a34a; color: white;
        }
        .tool-btn-green:hover { background: #15803d; }
        .tool-btn-red {
          background: #dc2626; color: white;
        }
        .tool-btn-red:hover { background: #b91c1c; }
        .tool-btn-purple {
          background: #7c3aed; color: white;
        }
        .tool-btn-purple:hover { background: #6d28d9; }
        .tool-btn-ghost {
          background: #f1f5f9; color: #64748b;
          border: 1px solid #e2e8f0;
        }
        .tool-btn-ghost:hover { background: #e2e8f0; color: #334155; }
        .tool-search {
          flex: 1;
          min-width: 200px;
          position: relative;
        }
        .tool-search input {
          width: 100%;
          padding: 8px 14px 8px 38px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: .82rem;
          outline: none;
          transition: border-color .2s;
          font-family: inherit;
        }
        .tool-search input:focus { border-color: #3b82f6; }
        .tool-search svg {
          position: absolute;
          left: 12px; top: 50%; transform: translateY(-50%);
          color: #94a3b8;
        }

        /* ── Stats Bar ── */
        .stats-bar {
          background: #0f172a;
          padding: 8px 24px;
          display: flex;
          align-items: center;
          gap: 20px;
          font-size: .72rem;
          color: #64748b;
        }
        .stats-bar strong { color: #60a5fa; font-weight: 800; }

        /* ── System Message ── */
        .sys-msg {
          margin: 0;
          padding: 10px 24px;
          background: #fef3c7;
          border-bottom: 1px solid #fbbf24;
          color: #92400e;
          font-weight: 700;
          font-size: .8rem;
          display: flex; align-items: center; gap: 8px;
        }
        .sys-msg.saved { background: #d1fae5; border-color: #22c55e; color: #065f46; }

        /* ── Table ── */
        .stock-table-wrap {
          padding: 0;
        }
        .stock-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
        }
        .stock-table thead th {
          color: white;
          font-size: .75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          padding: 16px 16px;
          text-align: center;
          position: sticky;
          top: 58px;
          z-index: 10;
        }
        .stock-table thead th:nth-child(1),
        .stock-table thead th:nth-child(5) {
          background: ${activeBrand === 'RE' ? '#c62020' : '#0c328c'};
        }
        .stock-table thead th:nth-child(2),
        .stock-table thead th:nth-child(3),
        .stock-table thead th:nth-child(4) {
          background: #121212;
        }
        .stock-table thead th:nth-child(2) {
          text-align: left;
          padding-left: 24px;
        }
        .stock-table tbody tr {
          border-bottom: 2px solid #f1f5f9;
          transition: background .15s;
        }
        .stock-table tbody tr:hover {
          background: #f8fafc;
        }
        .stock-table tbody td {
          padding: 16px 14px;
          text-align: center;
          vertical-align: middle;
          border-right: 2px solid #f8fafc;
        }
        .stock-table tbody td:last-child { border-right: none; }

        /* Row number */
        .row-no {
          width: 60px;
        }
        .no-badge {
          width: 26px; height: 26px;
          background: ${activeBrand === 'RE' ? '#c62020' : '#0c328c'};
          color: white;
          border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800;
          font-size: .85rem;
        }

        /* Item code cell */
        .item-cell {
          text-align: left !important;
          padding-left: 24px !important;
        }
        .item-code {
          font-weight: 800;
          font-size: 1.1rem;
          color: #0f172a;
          letter-spacing: .3px;
          line-height: 1.3;
        }
        .item-desc {
          font-size: .8rem;
          color: ${activeBrand === 'RE' ? '#c62020' : '#1d4ed8'};
          font-weight: 700;
          margin-top: 4px;
          text-transform: uppercase;
        }
        .item-mrp {
          font-size: .9rem;
          color: ${activeBrand === 'RE' ? '#c62020' : '#1d4ed8'};
          font-weight: 800;
          margin-top: 2px;
        }
        .item-underline {
          width: 40px;
          height: 3px;
          background: ${activeBrand === 'RE' ? '#cbd5e1' : '#1d4ed8'};
          margin-top: 8px;
          border-radius: 2px;
        }

        /* Picture cell */
        .pic-cell {
          width: 130px;
        }
        .pic-wrap {
          width: 90px; height: 90px;
          margin: 0 auto;
          border-radius: 10px;
          overflow: hidden;
          position: relative;
          cursor: pointer;
          background: #f8fafc;
          border: 2px solid #e2e8f0;
          transition: border-color .2s;
        }
        .pic-wrap:hover { border-color: #3b82f6; }
        .pic-wrap img {
          width: 100%; height: 100%;
          object-fit: contain;
        }
        .pic-wrap .pic-overlay {
          position: absolute; inset: 0;
          background: rgba(0,0,0,.5);
          display: flex; align-items: center; justify-content: center;
          opacity: 0;
          transition: opacity .2s;
          color: white;
        }
        .pic-wrap:hover .pic-overlay { opacity: 1; }
        .pic-placeholder {
          width: 100%; height: 100%;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          color: #cbd5e1;
          gap: 4px;
        }
        .pic-placeholder span { font-size: .6rem; font-weight: 600; }

        /* Size / Stock cells */
        .size-cell, .stock-cell {
          width: 80px;
        }
        .size-input, .stock-input {
          width: 100%;
          text-align: center;
          border: none;
          background: transparent;
          font-family: inherit;
          outline: none;
          transition: background .2s;
          border-radius: 6px;
          padding: 8px 4px;
        }
        .size-input {
          font-weight: 800;
          font-size: 1.1rem;
          color: #0f172a;
          text-transform: uppercase;
        }
        .stock-input {
          font-weight: 900;
          font-size: 1.6rem;
          color: ${activeBrand === 'RE' ? '#c62020' : '#0c328c'};
        }
        .size-input:focus, .stock-input:focus {
          background: #eff6ff;
          box-shadow: inset 0 0 0 2px #3b82f6;
        }

        /* Empty state */
        .empty-state {
          padding: 60px 20px;
          text-align: center;
          color: #94a3b8;
        }
        .empty-state p {
          font-weight: 700;
          font-size: .85rem;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-top: 12px;
        }

        /* ── Features Bar ── */
        .features-bar {
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          padding: 20px 24px;
          display: flex;
          justify-content: center;
          gap: 40px;
          flex-wrap: wrap;
        }
        .feat-item {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .feat-icon {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, #1d4ed8, #3b82f6);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: white;
          flex-shrink: 0;
        }
        .feat-label {
          font-size: .65rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #334155;
          line-height: 1.3;
        }

        /* ── Footer ── */
        .page-footer {
          background: #0a1628;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .footer-brand {
          display: flex; align-items: center; gap: 12px;
        }
        .footer-logo {
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          color: white;
          font-family: 'Bebas Neue', var(--font-bebas), sans-serif;
          font-size: 1.3rem;
          letter-spacing: 2px;
          padding: 8px 16px;
          border-radius: 6px;
          line-height: 1;
        }
        .footer-logo small {
          display: block;
          font-size: .5rem;
          letter-spacing: 3px;
          color: rgba(255,255,255,.7);
          font-family: 'Inter', sans-serif;
          font-weight: 600;
        }
        .footer-info {
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
        }
        .footer-info-item {
          display: flex; align-items: center; gap: 6px;
          color: #94a3b8;
          font-size: .68rem;
          font-weight: 600;
        }
        .footer-info-item svg { color: #3b82f6; flex-shrink: 0; }
        .footer-info-item strong { color: #e2e8f0; }
      `}</style>

      <div className="deon-page">

        {/* ══ TOP HEADER ══ */}
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="top-header-title">
              DEON <span>{activeBrand}</span> STOCK
            </div>
            <span className="cloud-dot" title="Cloud Sync Active"></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="brand-switcher">
              <button 
                className={`brand-btn ${activeBrand === 'RE' ? 'active-re' : ''}`}
                onClick={() => setActiveBrand('RE')}
              >
                RE Series
              </button>
              <button 
                className={`brand-btn ${activeBrand === 'AXXIS' ? 'active-axxis' : ''}`}
                onClick={() => setActiveBrand('AXXIS')}
              >
                AXXIS Series
              </button>
            </div>
            <div className={`brand-badge ${activeBrand === 'AXXIS' ? 'brand-badge-axxis' : ''}`}>
              {activeBrand === 'AXXIS' ? 'AXXIS HELMETS' : 'ROYAL ENFIELD'}
            </div>
          </div>
        </header>

        <div className="hero-banner">
          <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${activeBrand === 'AXXIS' ? '#1a0a0a' : '#0a1628'} 0%, ${activeBrand === 'AXXIS' ? '#2d1010' : '#1e3a5f'} 50%, ${activeBrand === 'AXXIS' ? '#1a0a0a' : '#0a1628'} 100%)` }} />
          <div className="hero-overlay">
            <div className="hero-left">
              <div className="hero-tagline">RIDE. STYLE. PROTECT.</div>
              <div className="hero-title">
                DEON {activeBrand === 'AXXIS' ? 'AXXIS' : 'RE'}<br />
                STOCK LIST
              </div>
            </div>
            <div className="hero-features">
              <div className="hero-feat">
                <div className="hero-feat-icon"><Shield size={16} /></div>
                <div className="hero-feat-text">PREMIUM<br/>PROTECTION</div>
              </div>
              <div className="hero-feat">
                <div className="hero-feat-icon"><BadgeCheck size={16} /></div>
                <div className="hero-feat-text">QUALITY<br/>YOU CAN TRUST</div>
              </div>
              <div className="hero-feat">
                <div className="hero-feat-icon"><Bike size={16} /></div>
                <div className="hero-feat-text">RIDE WITH<br/>CONFIDENCE</div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ TOOLBAR ══ */}
        <div className="toolbar">
          <label className="tool-btn tool-btn-primary" style={{ cursor: 'pointer' }}>
            <Upload size={16} /> Update Stock
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept=".xlsx" />
          </label>

          {items.length > 0 && (
            <>
              <button onClick={handleExportExcel} className="tool-btn tool-btn-green">
                <Download size={16} /> Excel
              </button>
              <button onClick={handleExportPDF} className="tool-btn tool-btn-red">
                <FileText size={16} /> PDF
              </button>
              <button onClick={handleClearData} className="tool-btn tool-btn-ghost">
                <Trash2 size={15} />
              </button>
            </>
          )}

          <div className="tool-search">
            <Search size={16} />
            <input 
              type="text" 
              placeholder={`Search ${activeBrand} models...`}
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
        </div>

        {/* ══ STATS BAR ══ */}
        <div className="stats-bar">
          <span>Total items: <strong>{filtered.length}</strong></span>
          <span>In stock: <strong>{inStockCount}</strong></span>
          <span>Brand: <strong>{activeBrand}</strong></span>
          {isSaving && <span style={{ color: '#fbbf24' }}>● Saving...</span>}
        </div>

        {/* ══ SYSTEM MESSAGE ══ */}
        {debugMsg && (
          <div className={`sys-msg ${debugMsg === 'Saved!' ? 'saved' : ''}`}>
            {debugMsg === 'Saved!' ? <CheckCircle size={15} /> : <RefreshCw size={15} />}
            {debugMsg}
          </div>
        )}

        {/* ══ STOCK TABLE ══ */}
        <div className="stock-table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>NO</th>
                <th>{activeBrand === 'RE' ? 'ITEM CODE / MRP' : 'ITEM CODE / MODEL'}</th>
                <th style={{ width: 130 }}>PICTURE</th>
                <th style={{ width: 80 }}>SIZE</th>
                <th style={{ width: 80 }}>STOCK</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map((item, index) => (
                <tr key={item.id}>
                  <td className="row-no">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div className="no-badge">{index + 1}</div>
                      <div style={{ width: 2, height: 16, background: '#1e293b', borderRadius: 2 }}></div>
                      <div style={{ width: 5, height: 5, background: '#1e293b', borderRadius: '50%' }}></div>
                    </div>
                  </td>
                  <td className="item-cell">
                    <div className="item-code">{item.code}</div>
                    {activeBrand !== 'RE' && item.originalDesc && (
                      <div className="item-desc">{item.originalDesc}</div>
                    )}
                    {item.mrp && (
                      <div className="item-mrp">(₹{item.mrp})</div>
                    )}
                    <div className="item-underline"></div>
                  </td>
                  <td className="pic-cell">
                    <label className="pic-wrap">
                      <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleImageUpload(item.id, e)} />
                      {item.image ? (
                        <>
                          <img src={item.image} alt={item.code} />
                          <div className="pic-overlay"><Camera size={20} /></div>
                        </>
                      ) : (
                        <div className="pic-placeholder">
                          <ImageIcon size={28} />
                          <span>Add</span>
                        </div>
                      )}
                    </label>
                  </td>
                  <td className="size-cell">
                    <input 
                      type="text" 
                      className="size-input"
                      defaultValue={item.size}
                      onBlur={(e) => handleSizeChange(item.id, e.target.value)}
                    />
                  </td>
                  <td className="stock-cell">
                    <input 
                      type="number" 
                      className="stock-input"
                      defaultValue={item.stock}
                      onBlur={(e) => handleStockChange(item.id, e.target.value)}
                    />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <FileQuestion size={48} />
                      <p>
                        {items.length === 0 ? "Database is empty. Upload an Excel file to get started." : `No ${activeBrand} items found.`}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ══ FEATURES BAR ══ */}
        <div className="features-bar">
          <div className="feat-item">
            <div className="feat-icon"><Shield size={16} /></div>
            <div className="feat-label">PREMIUM<br/>PROTECTION</div>
          </div>
          <div className="feat-item">
            <div className="feat-icon"><BadgeCheck size={16} /></div>
            <div className="feat-label">QUALITY<br/>YOU CAN TRUST</div>
          </div>
          <div className="feat-item">
            <div className="feat-icon"><Bike size={16} /></div>
            <div className="feat-label">RIDE WITH<br/>CONFIDENCE</div>
          </div>
          <div className="feat-item">
            <div className="feat-icon"><Wind size={16} /></div>
            <div className="feat-label">ADVANCED<br/>VENTILATION</div>
          </div>
        </div>

        {/* ══ FOOTER ══ */}
        <footer className="page-footer">
          <div className="footer-brand">
            <div className="footer-logo">
              DEON
              <small>AUTO ACCESSORIES</small>
            </div>
          </div>
          <div className="footer-info">
            <div className="footer-info-item">
              <MapPin size={14} />
              <span><strong>DEON AUTO ACCESSORIES</strong><br/>Calicut, Kerala, India</span>
            </div>
            <div className="footer-info-item">
              <Phone size={14} />
              <span>WHATSAPP<br/><strong>+91 90 37 37 37 37</strong></span>
            </div>
            <div className="footer-info-item">
              <Truck size={14} />
              <span><strong>ALL INDIA</strong><br/>SHIPPING AVAILABLE</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}