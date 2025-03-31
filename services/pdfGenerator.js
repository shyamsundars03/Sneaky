const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');

const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../fonts/Roboto-Regular.ttf'),
    bold: path.join(__dirname, '../fonts/Roboto-Bold.ttf'),
    italics: path.join(__dirname, '../fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, '../fonts/Roboto-BoldItalic.ttf')
  }
};

const printer = new PdfPrinter(fonts);

exports.generateSalesReport = async (orders, summary, filters) => {
  return new Promise((resolve, reject) => {
    try {
      const docDefinition = {
        content: [
          { 
            text: 'SNEAKY - SALES REPORT', 
            style: 'header',
            margin: [0, 0, 0, 20]
          },
          {
            columns: [
              { text: `Report Period: ${filters.from || 'N/A'} to ${filters.to || 'N/A'}`, width: '*' },
              { text: `Generated On: ${new Date().toLocaleDateString()}`, alignment: 'right' }
            ],
            margin: [0, 0, 0, 20]
          },
          { text: 'SUMMARY', style: 'sectionHeader' },
          createSummaryTable(summary),
          { text: '', margin: [0, 20] },
          { text: 'ORDER DETAILS', style: 'sectionHeader' },
          createOrdersTable(orders)
        ],
        styles: {
          header: {
            fontSize: 18,
            bold: true,
            alignment: 'center'
          },
          sectionHeader: {
            fontSize: 14,
            bold: true,
            margin: [0, 0, 0, 10],
            decoration: 'underline'
          },
          tableHeader: {
            bold: true,
            fontSize: 12,
            fillColor: '#eeeeee'
          }
        },
        defaultStyle: {
          font: 'Roboto',
          fontSize: 10
        }
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const filePath = path.join(__dirname, '../public/reports/sales-report.pdf');
      const writeStream = fs.createWriteStream(filePath);
      
      pdfDoc.pipe(writeStream);
      pdfDoc.end();
      
      writeStream.on('finish', () => resolve(filePath));
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

function createSummaryTable(summary) {
  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          { text: 'Total Orders', style: 'tableHeader' },
          { text: 'Total Revenue', style: 'tableHeader' },
          { text: 'Total Discount', style: 'tableHeader' },
          { text: 'Avg. Order Value', style: 'tableHeader' }
        ],
        [
          summary.totalOrders.toString(),
          `₹${summary.totalAmount.toFixed(2)}`,
          `₹${summary.totalDiscount.toFixed(2)}`,
          `₹${summary.avgOrderValue.toFixed(2)}`
        ]
      ]
    },
    layout: {
      hLineWidth: (i) => (i === 0 || i === 2) ? 1 : 0,
      vLineWidth: () => 0,
      paddingTop: (i) => i === 0 ? 5 : 0,
      paddingBottom: (i) => i === 1 ? 5 : 0
    }
  };
}

function createOrdersTable(orders) {
  return {
    table: {
      headerRows: 1,
      widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Order ID', style: 'tableHeader' },
          { text: 'Customer', style: 'tableHeader' },
          { text: 'Delivery Date', style: 'tableHeader' },
          { text: 'Items', style: 'tableHeader', alignment: 'center' },
          { text: 'Amount', style: 'tableHeader', alignment: 'right' },
          { text: 'Payment', style: 'tableHeader' },
          { text: 'Coupon', style: 'tableHeader' },
          { text: 'Discount', style: 'tableHeader', alignment: 'right' }
        ],
        ...orders.map(order => [
          order.transactionID ? `#${order.transactionID}` : 'N/A',
          { text: order.name || 'Guest', noWrap: true },
          order.deliveryDate || 'N/A',
          { text: (order.productsCount || 0).toString(), alignment: 'center' },
          { text: `₹${(order.totalCost || 0).toFixed(2)}`, alignment: 'right' },
          order.paymentMethod || 'Unknown',
          order.couponCode || 'None',
          { text: `₹${(order.discountAmount || 0).toFixed(2)}`, alignment: 'right' }
        ])
      ]
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
      vLineWidth: (i, node) => 0.5,
      hLineColor: (i, node) => '#cccccc',
      vLineColor: (i, node) => '#cccccc',
      fillColor: (rowIndex, node, columnIndex) => 
        rowIndex % 2 === 0 ? '#f5f5f5' : null,
      paddingTop: (i, node) => 4,
      paddingBottom: (i, node) => 4,
      paddingLeft: (i, node) => 4,
      paddingRight: (i, node) => 4
    },
    margin: [0, 5, 0, 15]
  };
}