const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const JSZip = require('jszip');
const { PDFDocument, rgb } = require('pdf-lib');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 7000;

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
    res.render('Stamping');
});

const processPdf = async (pdfBuffer, sdate, issued) => {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    // Load the stamp image and convert it to base64
    const stampImagePath = path.join(__dirname, 'public', 'Hero Reviewed Stamp.png');
    const stampImageBuffer = fs.readFileSync(stampImagePath);
    const stampImageBase64 = stampImageBuffer.toString('base64');
    const stampImageBytes = Uint8Array.from(Buffer.from(stampImageBase64, 'base64'));

    // Embed the PNG stamp image into the PDF
    const stampPdfImage = await pdfDoc.embedPng(stampImageBytes);

    for (const page of pages) {
        const { width, height } = page.getSize();

        // Determine the stamp dimensions and position
        const stampWidth = 250;
        const stampHeight = 190;
        const paddingFromBottom = 15 * 28.3464567; // 5 cm in points (1 cm = 28.3464567 points)
        const paddingFromLeft = 0; // on the left edge

        const x = paddingFromLeft;
        const y = height - paddingFromBottom - stampHeight;

        // Draw the image
        page.drawImage(stampPdfImage, {
            x: x,
            y: y,
            width: stampWidth,
            height: stampHeight,
        });

        // Add text to the stamp
        page.drawText(`${sdate}`, {
            x: x + 80,
            y: y + stampHeight - 95,
            size: 14,
            color: rgb(0, 0, 1) // blue color
        });

        page.drawText(`${issued}`, {
            x: x + 50,
            y: y + stampHeight - 112,
            size: 14,
            color: rgb(0, 0, 1) // blue color
        });
    }

    return pdfDoc.save();
};

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileType = req.file.mimetype;
    const fileName = req.file.originalname;
    const fileExtension = path.extname(fileName).toLowerCase();
    const sdate = req.body.sdate;
    const issued = req.body.issuedto;

    console.log(`File received: ${fileName}`);
    console.log(`MIME type: ${fileType}`);
    console.log(`File extension: ${fileExtension}`);

    try {
        if (fileExtension === '.zip' || fileType === 'application/zip') {
            const zip = new AdmZip(filePath);
            const zipEntries = zip.getEntries();
            const outputDir = 'processed/';

            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir);
            }

            let processedFiles = 0;
            let jsZip = new JSZip();

            for (const entry of zipEntries) {
                if (!entry.isDirectory && entry.entryName.endsWith('.pdf')) {
                    const pdfBuffer = entry.getData();
                    const processedPdfBytes = await processPdf(pdfBuffer, sdate, issued);

                    const outputFileName = entry.entryName;
                    jsZip.file(outputFileName, processedPdfBytes);
                    processedFiles++;
                }
            }

            if (processedFiles > 0) {
                const zipBuffer = await jsZip.generateAsync({ type: 'nodebuffer' });
                const outputPath = path.join(outputDir, 'stamped.zip');
                fs.writeFileSync(outputPath, zipBuffer);
                const downloadUrl = `/processed/stamped.zip`;
                res.json({ processedFiles, downloadUrl });
            } else {
                res.json({ processedFiles });
            }
        } else if (fileExtension === '.pdf' || fileType === 'application/pdf') {
            const pdfBuffer = fs.readFileSync(filePath);
            const processedPdfBytes = await processPdf(pdfBuffer, sdate, issued);

            const outputFileName = 'stamped.pdf';
            const outputPath = path.join('processed', outputFileName);
            fs.writeFileSync(outputPath, processedPdfBytes);

            const downloadUrl = `/processed/${outputFileName}`;
            res.json({ processedFiles: 1, downloadUrl });
        } else {
            res.status(400).json({ error: 'Unsupported file type' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        // Cleanup
        fs.unlinkSync(filePath);
    }
});

app.use('/processed', express.static(path.join(__dirname, 'processed')));

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
