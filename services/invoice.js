const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');
const Order = require('../models/orderSchema');

// Define fonts
const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../fonts/Roboto-Regular.ttf'),
    bold: path.join(__dirname, '../fonts/Roboto-Bold.ttf'),
    italics: path.join(__dirname, '../fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, '../fonts/Roboto-BoldItalic.ttf')
  }
};

const printer = new PdfPrinter(fonts);

exports.generateUserInvoice = async (orderId) => {
  try {
    const order = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('items.product', 'productName price');

    if (!order) {
      throw new Error('Order not found');
    }

    // Create invoice directory if it doesn't exist
    const invoicesDir = path.join(__dirname, '../public/invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    const filePath = path.join(invoicesDir, `${order.transactionId}.pdf`);

    // Calculate totals
    let subTotal = 0;
    let cancelledAmount = 0;
    let returnedAmount = 0;

    const processedItems = order.items.map(item => {
      const itemTotal = item.price * item.quantity;
      
      if (item.status === 'Cancelled') {
        cancelledAmount += itemTotal;
      } else if (item.status === 'Returned') {
        returnedAmount += itemTotal;
      } else {
        subTotal += itemTotal;
      }
      
      return {
        product: item.product,
        quantity: item.quantity,
        price: item.price,
        total: itemTotal,
        status: item.status
      };
    });

    const shippingCost = order.shippingCost || 0;
    const discountAmount = order.discountAmount || 0;
    const grandTotal = (subTotal + shippingCost - discountAmount).toFixed(2);

    // Document definition
    const docDefinition = {
      content: [
        { 
          text: 'SNEAKY - INVOICE', 
          style: 'header',
          margin: [0, 0, 0, 20]
        },
        {
          columns: [
            { 
              text: [
                { text: 'Sneaky, Inc.\n', bold: true },
                '123 Fashion Street\n',
                'Footwear City, FC 12345\n'
              ],
              width: '*'
            },
            { 
              text: [
                { text: `Invoice #: ${order.transactionId}\n`, bold: true },
                `Date: ${order.createdAt.toLocaleDateString()}\n`,
                { text: `Status: ${order.status}`, color: getStatusColor(order.status) }
              ],
              width: '*',
              alignment: 'right'
            }
          ],
          margin: [0, 0, 0, 20]
        },
        {
          columns: [
            {
              text: [
                { text: 'Bill To:\n', style: 'subheader' },
                `${order.shippingAddress.name}\n`,
                `${order.shippingAddress.street}\n`,
                `${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zip}\n`,
                `${order.shippingAddress.country}\n`
              ],
              width: '*'
            },
            {
              text: [
                { text: 'Payment Method:\n', style: 'subheader' },
                `${order.paymentMethod}\n`,
                { text: `Status: ${order.paymentStatus || 'Completed'}`, color: (order.paymentStatus === 'Completed' || order.paymentStatus === 'Paid') ? 'green' : 'red' }
              ],
              width: '*',
              alignment: 'right'
            }
          ],
          margin: [0, 0, 0, 20]
        },
        createOrderItemsTable(processedItems),
        { text: '\n' },
        createOrderTotals(subTotal, cancelledAmount, returnedAmount, shippingCost, discountAmount, grandTotal, order.couponCode)
      ],
      footer: {
        text: [
          { text: 'Thank you for shopping with SNEAKY!\n', alignment: 'center' },
          { text: 'If you have any questions, please contact us at support@sneaky.com', alignment: 'center' }
        ],
        fontSize: 10,
        color: '#999999',
        margin: [40, 0]
      },
      styles: {
        header: {
          fontSize: 20,
          bold: true,
          alignment: 'center'
        },
        subheader: {
          fontSize: 14,
          bold: true,
          margin: [0, 5, 0, 5]
        },
        tableHeader: {
          bold: true,
          fontSize: 12,
          fillColor: '#eeeeee'
        },
        cancelledItem: {
          decoration: 'lineThrough',
          color: 'red'
        },
        returnedItem: {
          decoration: 'lineThrough',
          color: 'blue'
        }
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 12
      }
    };

    // Generate PDF
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const writeStream = fs.createWriteStream(filePath);
    pdfDoc.pipe(writeStream);
    pdfDoc.end();

    // Wait for file to be written
    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(filePath));
      writeStream.on('error', reject);
    });
  } catch (error) {
    console.error('Error generating user invoice:', error);
    throw error;
  }
};

function getStatusColor(status) {
  switch(status.toLowerCase()) {
    case 'cancelled':
      return 'red';
    case 'delivered':
      return 'green';
    case 'returned':
    case 'return requested':
      return 'blue';
    default:
      return 'black';
  }
}

function createOrderItemsTable(items) {
  const itemsBody = items.map(item => {
    let itemStyle = null;

    if (item.status === 'Cancelled') {
      itemStyle = 'cancelledItem';
    } else if (item.status === 'Returned') {
      itemStyle = 'returnedItem';
    }

    return [
      { 
        text: item.product?.productName || 'Product unavailable',
        style: itemStyle 
      },
      { 
        text: `₹${item.price.toFixed(2)}`, 
        style: itemStyle,
        alignment: 'right' 
      },
      { 
        text: item.quantity.toString(), 
        style: itemStyle,
        alignment: 'center' 
      },
      { 
        text: item.status, 
        style: itemStyle 
      },
      { 
        text: `₹${item.total.toFixed(2)}`, 
        style: itemStyle,
        alignment: 'right' 
      }
    ];
  });

  return {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Item', style: 'tableHeader' },
          { text: 'Price', style: 'tableHeader', alignment: 'right' },
          { text: 'Quantity', style: 'tableHeader', alignment: 'center' },
          { text: 'Status', style: 'tableHeader' },
          { text: 'Total', style: 'tableHeader', alignment: 'right' }
        ],
        ...itemsBody
      ]
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
      vLineWidth: (i, node) => 0.5,
      hLineColor: (i, node) => '#cccccc',
      vLineColor: (i, node) => '#cccccc'
    }
  };
}

function createOrderTotals(subTotal, cancelledAmount, returnedAmount, shippingCost, discountAmount, grandTotal, couponCode) {
  const totalsBody = [
    [{ text: 'Subtotal:', bold: true }, { text: `₹${subTotal.toFixed(2)}`, alignment: 'right' }]
  ];

  if (cancelledAmount > 0) {
    totalsBody.push([
      { text: 'Cancelled Items:', bold: true, color: 'red' }, 
      { text: `-₹${cancelledAmount.toFixed(2)}`, alignment: 'right', color: 'red' }
    ]);
  }

  if (returnedAmount > 0) {
    totalsBody.push([
      { text: 'Returned Items:', bold: true, color: 'blue' }, 
      { text: `-₹${returnedAmount.toFixed(2)}`, alignment: 'right', color: 'blue' }
    ]);
  }

  totalsBody.push([
    { text: 'Shipping:', bold: true }, 
    { text: `₹${shippingCost.toFixed(2)}`, alignment: 'right' }
  ]);

  if (discountAmount > 0) {
    totalsBody.push([
      { text: `Discount ${couponCode ? `(${couponCode})` : ''}:`, bold: true }, 
      { text: `-₹${discountAmount.toFixed(2)}`, alignment: 'right' }
    ]);
  }

  totalsBody.push([
    { text: 'Grand Total:', bold: true, fontSize: 14 }, 
    { text: `₹${grandTotal}`, bold: true, alignment: 'right', fontSize: 14 }
  ]);

  return {
    table: {
      widths: ['*', 100],
      body: totalsBody
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 20],
    alignment: 'right'
  };
}