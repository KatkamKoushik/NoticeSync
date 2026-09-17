const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('demo/sample-syllabus.pdf'));

doc.fontSize(24).text('ENG101: Introduction to Literature', { align: 'center' });
doc.moveDown();
doc.fontSize(16).text('Fall 2026 Syllabus', { align: 'center' });
doc.moveDown(2);

doc.fontSize(14).text('Course Schedule & Deadlines', { underline: true });
doc.moveDown();

doc.fontSize(12)
   .text('Week 1-3: Poetry Analysis')
   .text('• First draft of poetry essay is due on September 15th, 2026.')
   .text('• Final poetry essay must be submitted by September 22, 2026.')
   .moveDown()
   .text('Week 4-7: The Modern Novel')
   .text('• Midterm Exam will take place in class on October 10, 2026.')
   .text('• Reading journal 1 is due Oct 15, 2026.')
   .moveDown()
   .text('Week 8-12: Drama and Performance')
   .text('• Drama analysis paper due November 5, 2026.')
   .moveDown()
   .text('Finals Week')
   .text('• Final Project Presentations begin on December 1st, 2026.')
   .text('• The Final Exam is scheduled for December 14, 2026 at 9:00 AM.');

doc.end();
