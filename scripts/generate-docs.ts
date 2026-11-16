import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

interface DocMapping {
  srcMarkdown: string;
  destPdf: string;
  title: string;
}

const DOCS_TO_GENERATE: DocMapping[] = [
  {
    srcMarkdown: 'docs/PRD.md',
    destPdf: 'docs/pdf/Cubyntra-PRD.pdf',
    title: 'Product Requirements Document (PRD)',
  },
  {
    srcMarkdown: 'docs/SRS.md',
    destPdf: 'docs/pdf/Cubyntra-SRS.pdf',
    title: 'Software Requirements Specification (SRS)',
  },
  {
    srcMarkdown: 'docs/ARCHITECTURE.md',
    destPdf: 'docs/pdf/Cubyntra-Architecture.pdf',
    title: 'System Architecture Specification',
  },
  {
    srcMarkdown: 'docs/SYSTEM_DESIGN.md',
    destPdf: 'docs/pdf/Cubyntra-System-Design.pdf',
    title: 'System Design Document',
  },
  {
    srcMarkdown: 'docs/COMPUTER_VISION.md',
    destPdf: 'docs/pdf/Cubyntra-Computer-Vision.pdf',
    title: 'Computer Vision Pipeline Specification',
  },
  {
    srcMarkdown: 'docs/CUBE_MODEL.md',
    destPdf: 'docs/pdf/Cubyntra-Cube-Model.pdf',
    title: 'Cube Mathematical Domain Model',
  },
  {
    srcMarkdown: 'docs/SOLVER.md',
    destPdf: 'docs/pdf/Cubyntra-Solver.pdf',
    title: 'Solver Specification (Kociemba Two-Phase and Worker)',
  },
  {
    srcMarkdown: 'docs/UI_UX.md',
    destPdf: 'docs/pdf/Cubyntra-UI-UX.pdf',
    title: 'UI/UX Design System Specification',
  },
  {
    srcMarkdown: 'docs/TESTING.md',
    destPdf: 'docs/pdf/Cubyntra-Testing.pdf',
    title: 'Testing & Quality Assurance Strategy',
  },
  {
    srcMarkdown: 'docs/SECURITY_PRIVACY.md',
    destPdf: 'docs/pdf/Cubyntra-Security-Privacy.pdf',
    title: 'Security & Privacy Specification',
  },
  {
    srcMarkdown: 'docs/FUTURE_HARDWARE.md',
    destPdf: 'docs/pdf/Cubyntra-Future-Hardware.pdf',
    title: 'Conceptual Hardware: Robotic Solver (Concept Only)',
  },
  {
    srcMarkdown: 'docs/ROADMAP.md',
    destPdf: 'docs/pdf/Cubyntra-Roadmap.pdf',
    title: 'Product Roadmap',
  },
  {
    srcMarkdown: 'docs/AI_MODEL_TRAINING_METHODOLOGY.md',
    destPdf: 'docs/pdf/Cubyntra-AI-Model-Training.pdf',
    title: 'AI Model Training Methodology & Empirical Vision Pipeline',
  },
  {
    srcMarkdown: 'docs/THREE_D_ENGINE.md',
    destPdf: 'docs/pdf/Cubyntra-Three-D-Engine.pdf',
    title: '3D Graphics Engine & Digital Twin Specification',
  },
  {
    srcMarkdown: 'docs/DATA_FLOW.md',
    destPdf: 'docs/pdf/Cubyntra-Data-Flow.pdf',
    title: 'Data Flow Architecture',
  },
  {
    srcMarkdown: 'docs/API_REFERENCE.md',
    destPdf: 'docs/pdf/Cubyntra-API-Reference.pdf',
    title: 'TypeScript API & HTTP Route Reference',
  },
  {
    srcMarkdown: 'docs/DEVELOPMENT.md',
    destPdf: 'docs/pdf/Cubyntra-Development.pdf',
    title: 'Local Development Guide',
  },
  {
    srcMarkdown: 'docs/DEPLOYMENT.md',
    destPdf: 'docs/pdf/Cubyntra-Deployment.pdf',
    title: 'Deployment Guide (Localhost Only)',
  },
  {
    srcMarkdown: 'docs/tutor/METHODS.md',
    destPdf: 'docs/pdf/Cubyntra-Tutor-Methods.pdf',
    title: 'Tutor Methods & Tutor Engine',
  },
  {
    srcMarkdown: 'docs/tutor/CHECKPOINTS.md',
    destPdf: 'docs/pdf/Cubyntra-Tutor-Checkpoints.pdf',
    title: 'Tutor Checkpoint Checks',
  },
  {
    srcMarkdown: 'docs/ADR/011-voxel-design-system.md',
    destPdf: 'docs/pdf/Cubyntra-ADR-011-Voxel-Design-System.pdf',
    title: 'ADR-011: Voxel Design System',
  },
  {
    srcMarkdown: 'docs/ADR/012-deterministic-tutor-engine.md',
    destPdf: 'docs/pdf/Cubyntra-ADR-012-Deterministic-Tutor-Engine.pdf',
    title: 'ADR-012: Deterministic Tutor Engine',
  },
  {
    srcMarkdown: 'docs/ADR/013-checkpoint-verification.md',
    destPdf: 'docs/pdf/Cubyntra-ADR-013-Checkpoint-Verification.pdf',
    title: 'ADR-013: Checkpoint Verification',
  },
  {
    srcMarkdown: 'docs/ADR/014-claude-coach.md',
    destPdf: 'docs/pdf/Cubyntra-ADR-014-Claude-Coach.pdf',
    title: 'ADR-014: Claude Coach',
  },
  {
    srcMarkdown: 'docs/ADR/015-state-only-sync.md',
    destPdf: 'docs/pdf/Cubyntra-ADR-015-State-Only-Sync.pdf',
    title: 'ADR-015: State-Only Phone-Laptop Sync',
  },
];

/**
 * The standard PDF fonts (Helvetica, Courier) only cover WinAnsi. Characters outside it would
 * print as garbage, so the arrows, math signs and box-drawing characters used in the docs are
 * spelled in ASCII first. Characters that WinAnsi has (en and em dashes, curly quotes, §, °, ±,
 * ×, ·, •) are kept.
 */
const WIN_ANSI_FALLBACKS: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>',
  '≤': '<=', '≥': '>=', '≡': '==', '≈': '~', '≠': '!=', '−': '-',
  'Δ': 'Delta ', 'π': 'pi', '✓': 'v', '✗': 'x',
  '─': '-', '━': '-', '│': '|', '┃': '|',
  '┌': '+', '┐': '+', '└': '+', '┘': '+', '├': '+', '┤': '+', '┬': '+', '┴': '+', '┼': '+',
  '►': '>', '▶': '>', '◄': '<', '◀': '<', '▼': 'v', '▲': '^',
};

function toWinAnsi(text: string): string {
  let out = '';
  for (const ch of text) {
    const mapped = WIN_ANSI_FALLBACKS[ch];
    if (mapped !== undefined) out += mapped;
    else if ((ch.codePointAt(0) ?? 0) > 0xff && !'–—‘’“”…•€™'.includes(ch)) out += '?';
    else out += ch;
  }
  return out;
}

function cleanMarkdownLine(line: string): string {
  // Strip bold/italic markdown and format LaTeX characters for clean plain PDF rendering
  return toWinAnsi(line)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\\Delta E/g, 'Delta-E')
    .replace(/\\to/g, '->')
    .replace(/\\le/g, '<=')
    .replace(/\\ge/g, '>=')
    .replace(/\\approx/g, '~')
    .replace(/\\times/g, 'x')
    .replace(/\\in/g, 'in')
    .replace(/\\pm/g, '+/-')
    .replace(/\\mu/g, 'u')
    .replace(/\\sigma/g, 'sigma')
    .replace(/\\alpha/g, 'alpha')
    .replace(/\\beta/g, 'beta')
    .replace(/\\lambda/g, 'lambda')
    .replace(/\\epsilon/g, 'epsilon')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\circ/g, '°')
    .replace(/\$+/g, '');
}

async function generatePdfForMarkdown(docMapping: DocMapping): Promise<void> {
  const rootDir = process.cwd();
  const inputPath = path.join(rootDir, docMapping.srcMarkdown);
  const outputPath = path.join(rootDir, docMapping.destPdf);

  if (!fs.existsSync(inputPath)) {
    console.warn(`[WARN] Skipping ${docMapping.srcMarkdown}: file not found`);
    return;
  }

  const markdownContent = fs.readFileSync(inputPath, 'utf8');
  const lines = markdownContent.split(/\r?\n/);

  const destDir = path.dirname(outputPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
    });

    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Document Header
    doc
      .fillColor('#0284C7')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('CUBYNTRA ENGINEERING SPECIFICATION  |  NECOOKIE LABS', { align: 'left' });
    doc
      .fillColor('#64748B')
      .fontSize(8)
      .font('Helvetica')
      .text('OPEN SOURCE (MIT)  •  GENERATED FROM THE MARKDOWN SOURCE', { align: 'right' });

    doc.moveDown(0.5);
    doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1.5);

    // Title
    doc
      .fillColor('#0F172A')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text(docMapping.title, { align: 'left' });
    
    doc
      .fillColor('#64748B')
      .fontSize(10)
      .font('Helvetica')
      .text(`Source: ${docMapping.srcMarkdown}  •  Generated ${new Date().toISOString().slice(0, 10)}`, { align: 'left' });

    doc.moveDown(1);
    doc.strokeColor('#0284C7').lineWidth(2).moveTo(50, doc.y).lineTo(150, doc.y).stroke();
    doc.moveDown(1.5);

    let inCodeBlock = false;
    let codeBlockText = '';

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];

      // Handle Code Blocks
      if (rawLine.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockText = '';
        } else {
          inCodeBlock = false;
          // Render accumulated code block
          doc.moveDown(0.3);
          const startY = doc.y;
          doc.font('Courier').fontSize(8).fillColor('#1E293B');
          
          // Draw code text
          doc.text(toWinAnsi(codeBlockText.trimEnd()), 60, startY + 5, {
            width: 475,
            lineGap: 2,
          });
          doc.moveDown(0.5);
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockText += rawLine + '\n';
        continue;
      }

      const trimmed = rawLine.trim();

      // Empty line
      if (!trimmed) {
        doc.moveDown(0.4);
        continue;
      }

      // Horizontal Rule
      if (trimmed === '---' || trimmed === '***') {
        doc.moveDown(0.5);
        doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
        continue;
      }

      // H1 Header
      if (rawLine.startsWith('# ')) {
        const text = cleanMarkdownLine(rawLine.replace(/^#\s+/, ''));
        // The document's own title is already printed in the header block
        if (i < 5) {
          continue;
        }
        doc.moveDown(1.2);
        doc.fillColor('#0F172A').fontSize(16).font('Helvetica-Bold').text(text);
        doc.moveDown(0.3);
        continue;
      }

      // H2 Header
      if (rawLine.startsWith('## ')) {
        const text = cleanMarkdownLine(rawLine.replace(/^##\s+/, ''));
        doc.moveDown(1);
        doc.fillColor('#1E293B').fontSize(13).font('Helvetica-Bold').text(text);
        doc.moveDown(0.3);
        continue;
      }

      // H3 Header
      if (rawLine.startsWith('### ')) {
        const text = cleanMarkdownLine(rawLine.replace(/^###\s+/, ''));
        doc.moveDown(0.8);
        doc.fillColor('#334155').fontSize(11).font('Helvetica-Bold').text(text);
        doc.moveDown(0.2);
        continue;
      }

      // Blockquotes / Alerts
      if (rawLine.startsWith('>')) {
        const text = cleanMarkdownLine(rawLine.replace(/^>\s*(\[!.*?\])?\s*/, ''));
        doc.moveDown(0.3);
        const alertY = doc.y;
        doc.strokeColor('#0284C7').lineWidth(2).moveTo(55, alertY).lineTo(55, alertY + 20).stroke();
        doc.fillColor('#0369A1').fontSize(9).font('Helvetica-Oblique').text(text, 65, alertY + 2, {
          width: 470,
        });
        doc.moveDown(0.3);
        continue;
      }

      // List Items
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
        const bulletText = cleanMarkdownLine(trimmed.replace(/^[-*]\s+|\d+\.\s+/, ''));
        doc.fillColor('#334155').fontSize(9).font('Helvetica');
        doc.text('•  ' + bulletText, 60, doc.y, {
          width: 485,
          indent: -10,
        });
        continue;
      }

      // Table Row
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        // Skip separator line |:---|:---|
        if (/^\|[\s\-:]+\|/.test(trimmed)) {
          continue;
        }
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => cleanMarkdownLine(c.trim()));
        
        if (doc.y > 710) {
          doc.addPage();
        }

        const startY = doc.y;
        doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B');
        const colWidth = 485 / Math.max(cells.length, 1);
        let maxHeight = 10;

        cells.forEach((cell, idx) => {
          const cellX = 55 + idx * colWidth;
          const textHeight = doc.heightOfString(cell, { width: colWidth - 4 });
          if (textHeight > maxHeight) {
            maxHeight = textHeight;
          }
          doc.text(cell, cellX, startY, {
            width: colWidth - 4,
            lineBreak: true,
          });
        });

        doc.y = startY + maxHeight + 3;
        doc.x = 50;
        continue;
      }

      // Regular Paragraph text
      const cleanText = cleanMarkdownLine(trimmed);
      doc.fillColor('#334155').fontSize(9.5).font('Helvetica').text(cleanText, 50, doc.y, {
        width: 495,
        align: 'left',
        lineGap: 3,
      });
      doc.moveDown(0.2);
    }

    // Add Page Numbers to all pages
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(p);
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(50, 770).lineTo(545, 770).stroke();
      doc
        .fillColor('#94A3B8')
        .fontSize(8)
        .font('Helvetica')
        .text('Cubyntra  •  Necookie Labs  •  See it. Solve it.', 50, 775, {
          lineBreak: false,
          width: 250,
          align: 'left',
        });
      doc
        .fillColor('#94A3B8')
        .fontSize(8)
        .font('Helvetica')
        .text(`Page ${p + 1} of ${range.count}`, 295, 775, {
          lineBreak: false,
          width: 250,
          align: 'right',
        });
    }

    doc.end();

    writeStream.on('finish', () => {
      console.log(`[OK] Generated: ${docMapping.destPdf}`);
      resolve();
    });

    writeStream.on('error', (err) => {
      console.error(`[ERROR] Failed writing ${docMapping.destPdf}:`, err);
      reject(err);
    });
  });
}

async function main() {
  console.log('--- Starting Cubyntra Engineering PDF Documentation Generation ---');
  let successCount = 0;

  for (const doc of DOCS_TO_GENERATE) {
    try {
      await generatePdfForMarkdown(doc);
      successCount++;
    } catch (error) {
      console.error(`Error generating ${doc.destPdf}:`, error);
    }
  }

  console.log(`--- Finished: Successfully generated ${successCount} / ${DOCS_TO_GENERATE.length} PDF specifications ---`);
}

main().catch((err) => {
  console.error('Fatal error in PDF generation:', err);
  process.exit(1);
});
