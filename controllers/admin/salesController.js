const Order = require('../../models/orderSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { generateSalesReport } = require('../../services/pdfGenerator');


// Helper functions
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const pad = num => num.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getDateRange(period) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = new Date(today);
    
    switch(period) {
        case 'today':
            return { from: formatDate(today), to: formatDate(today) };
        case 'week':
            fromDate.setDate(today.getDate() - 7);
            return { from: formatDate(fromDate), to: formatDate(today) };
        case 'month':
            fromDate.setMonth(today.getMonth() - 1);
            return { from: formatDate(fromDate), to: formatDate(today) };
        case 'year':
            fromDate.setFullYear(today.getFullYear() - 1);
            return { from: formatDate(fromDate), to: formatDate(today) };
        default:
            return { from: '', to: '' };
    }
}

async function calculateSalesSummary(query) {
    const orders = await Order.find(query).populate('user', 'name');
    
    const summary = {
        totalAmount: 0,
        totalDiscount: 0,
        totalOrders: orders.length,
        avgOrderValue: 0
    };

    if (orders.length > 0) {
        summary.totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        
        // Calculate total discount (coupon + offer discounts)
        summary.totalDiscount = orders.reduce((sum, order) => {
            const couponDiscount = order.discountAmount || 0;
            // Add any offer discounts if you have them in your order schema
            return sum + couponDiscount;
        }, 0);
        
        summary.avgOrderValue = summary.totalAmount / summary.totalOrders;
    }

    return summary;
}
const loadSales = async (req, res) => {
    try {
        // Get filters from query or session
        const { from, to, period = 'custom' } = req.query;
        let dateRange = {};
        

        if (period !== 'custom') {
            dateRange = getDateRange(period);
        } else if (from && to) {
            dateRange = { from, to };
        }

        const query = { status: 'Delivered' };
        if (dateRange.from && dateRange.to) {
            const startDate = new Date(dateRange.from);
            const endDate = new Date(dateRange.to);
            endDate.setHours(23, 59, 59, 999);
            query.deliveredDate = { $gte: startDate, $lte: endDate };
        }

        const orders = await Order.find(query).populate('user', 'name').sort({ deliveredDate: -1 });
        const summary = await calculateSalesSummary(query);

        res.render("sales", {
            filterFrom: dateRange.from || from || '',
            filterTo: dateRange.to || to || '',
            filterPeriod: period,
            initialOrders: orders.map((order, index) => ({
                sNo: index + 1,
                name: order.user?.name || 'Guest',
                deliveryDate: formatDate(order.deliveredDate),
                productsCount: order.items?.reduce((total, item) => total + (item.quantity || 0), 0) || 0,
                totalCost: order.totalAmount || 0,
                paymentMethod: order.paymentMethod || 'Unknown',
                couponCode: order.couponCode || 'None',
                discountAmount: order.discountAmount || 0,
                transactionID: order.transactionId || 'N/A'
            })),
            summary: {
                totalAmount: summary.totalAmount.toFixed(2),
                totalDiscount: summary.totalDiscount.toFixed(2),
                totalOrders: summary.totalOrders,
                avgOrderValue: summary.avgOrderValue.toFixed(2)
            },
            error: null
        });
    } catch (error) {
        console.error("Error loading sales page:", error);
        res.status(500).render("sales", {
            error: "Failed to load sales data",
            filterFrom: '',
            filterTo: '',
            filterPeriod: 'custom',
            initialOrders: [],
            summary: {
                totalAmount: 0,
                totalDiscount: 0,
                totalOrders: 0,
                avgOrderValue: 0
            }
        });
    }
};




// This is the updated getSalesData function in salesController.js
const getSalesData = async (req, res) => {
    try {
        const { from, to, period = 'custom' } = req.query;
        let dateRange = {};
        
        console.log('Sales data request with filters:', { from, to, period });
        
        if (period !== 'custom') {
            dateRange = getDateRange(period);
        } else if (from && to) {
            dateRange = { from, to };
        }

        const query = { status: 'Delivered' };
        if (dateRange.from && dateRange.to) {
            const startDate = new Date(dateRange.from);
            const endDate = new Date(dateRange.to);
            endDate.setHours(23, 59, 59, 999);
            query.deliveredDate = { $gte: startDate, $lte: endDate };
        }

        console.log('Sales query:', JSON.stringify(query));

        const orders = await Order.find(query)
            .populate('user', 'name')
            .sort({ deliveredDate: -1 });

        console.log(`Found ${orders.length} orders matching criteria`);

        const summary = await calculateSalesSummary(query);

        res.json({
            success: true,
            orders: orders.map((order, index) => ({
                sNo: index + 1,
                transactionID: order.transactionId || 'N/A',
                name: order.user?.name || 'Guest',
                deliveryDate: formatDate(order.deliveredDate),
                productsCount: order.items?.reduce((total, item) => total + (item.quantity || 0), 0) || 0,
                totalCost: order.totalAmount || 0,
                paymentMethod: order.paymentMethod || 'Unknown',
                couponCode: order.couponCode || 'None',
                discountAmount: order.discountAmount || 0
            })),
            summary: {
                totalAmount: summary.totalAmount,
                totalDiscount: summary.totalDiscount,
                totalOrders: summary.totalOrders,
                avgOrderValue: summary.avgOrderValue
            }
        });
    } catch (error) {
        console.error("Error getting sales data:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};



const generateExcelReport = async (reportData, summary, filters) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');
        
        // Add Report Header
        worksheet.addRow(['SNEAKY - SALES REPORT']).font = { size: 16, bold: true };
        worksheet.mergeCells('A1:H1');
        
        // Add Report Info
        worksheet.addRow([`Report Period: ${filters.from || 'N/A'} to ${filters.to || 'N/A'}`]);
        worksheet.addRow([`Generated On: ${new Date().toLocaleDateString()}`]);
        worksheet.addRow([]);
        
        // Add Summary Section
        worksheet.addRow(['SUMMARY']).font = { bold: true };
        worksheet.mergeCells('A5:H5');
        worksheet.addRow(['Total Orders', 'Total Revenue', 'Total Discount', 'Average Order Value']);
        worksheet.addRow([
            summary.totalOrders,
            summary.totalAmount,
            summary.totalDiscount,
            summary.avgOrderValue
        ]);
        
        // Format summary numbers
        worksheet.getCell('B7').numFmt = '₹#,##0.00';
        worksheet.getCell('C7').numFmt = '₹#,##0.00';
        worksheet.getCell('D7').numFmt = '₹#,##0.00';
        
        // Add space before orders
        worksheet.addRow([]);
        worksheet.addRow([]);
        
        // Add Orders Header
        worksheet.addRow(['ORDER DETAILS']).font = { bold: true };
        worksheet.mergeCells('A10:H10');
        
        // Add Column Headers
        const headerRow = worksheet.addRow([
            'Order ID', 'Customer', 'Delivery Date', 'Items', 'Amount', 'Payment', 'Coupon', 'Discount'
        ]);
        headerRow.font = { bold: true };
        headerRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        
        // Add Order Data - Use the same property names as in PDF generation
        reportData.forEach(order => {
            const row = worksheet.addRow([
                order.transactionID || 'N/A', // Changed from transactionId to transactionID
                order.name || 'Guest', // This is correct as reportData already has formatted name
                order.deliveryDate || 'N/A',
                order.productsCount || 0,
                order.totalCost || 0,
                order.paymentMethod || 'Unknown',
                order.couponCode || 'None',
                order.discountAmount || 0
            ]);
            
            // Format numeric cells
            row.getCell(5).numFmt = '₹#,##0.00'; // Amount
            row.getCell(8).numFmt = '₹#,##0.00'; // Discount
            
            // Add borders to cells
            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });
        
        // Set column widths
        worksheet.columns = [
            { width: 15 }, // Order ID
            { width: 20 }, // Customer
            { width: 15 }, // Delivery Date
            { width: 10 }, // Items
            { width: 12 }, // Amount
            { width: 15 }, // Payment
            { width: 15 }, // Coupon
            { width: 12 }  // Discount
        ];
        
        // Save file
        const filePath = path.join(__dirname, '../../public/reports/sales-report.xlsx');
        await workbook.xlsx.writeFile(filePath);
        
        return filePath;
    } catch (error) {
        console.error('Excel generation error:', error);
        throw error;
    }
};


const downloadPDF = async (req, res) => {
    try {
        const { from, to, period = 'custom' } = req.query;
        
        // Store filters in session
        req.session.salesFilters = { from, to, period };
        
        // Build query
        const query = { status: 'Delivered' };
        if (from && to) {
            const startDate = new Date(from);
            const endDate = new Date(to);
            endDate.setHours(23, 59, 59, 999);
            query.deliveredDate = { $gte: startDate, $lte: endDate };
        }

        const orders = await Order.find(query)
            .populate('user', 'name')
            .sort({ deliveredDate: -1 });

        const summary = await calculateSalesSummary(query);

        const pdfData = orders.map(order => ({
            transactionID: order.transactionId || 'N/A',
            name: order.user?.name || 'Guest',
            deliveryDate: order.deliveredDate ? formatDate(order.deliveredDate) : 'N/A',
            productsCount: order.items?.reduce((total, item) => total + (item.quantity || 0), 0) || 0,
            totalCost: order.totalAmount || 0,
            paymentMethod: order.paymentMethod || 'Unknown',
            couponCode: order.couponCode || 'None',
            discountAmount: order.discountAmount || 0
        }));

        const filePath = await generateSalesReport(pdfData, summary, { from, to });
        res.download(filePath, 'sales-report.pdf', (err) => {
            if (err) console.error('Error sending PDF:', err);
            fs.unlink(filePath, () => {});
        });
    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).send('Failed to generate PDF');
    }
};

const downloadExcel = async (req, res) => {
    try {
        const { from, to, period = 'custom' } = req.query;
        
        // Store filters in session
        req.session.salesFilters = { from, to, period };
        
        // Build query
        const query = { status: 'Delivered' };
        if (from && to) {
            const startDate = new Date(from);
            const endDate = new Date(to);
            endDate.setHours(23, 59, 59, 999);
            query.deliveredDate = { $gte: startDate, $lte: endDate };
        }

        const orders = await Order.find(query)
            .populate('user', 'name')
            .sort({ deliveredDate: -1 });

        const summary = await calculateSalesSummary(query);

        const reportData = orders.map((order, index) => ({
            sNo: index + 1,
            transactionID: order.transactionId || 'N/A',
            name: order.user?.name || 'Guest',
            deliveryDate: order.deliveredDate ? formatDate(order.deliveredDate) : 'N/A',
            productsCount: order.items?.reduce((total, item) => total + (item.quantity || 0), 0) || 0,
            totalCost: order.totalAmount || 0,
            paymentMethod: order.paymentMethod || 'Unknown',
            couponCode: order.couponCode || 'None',
            discountAmount: order.discountAmount || 0
        }));

        const filePath = await generateExcelReport(reportData, summary, { from, to });
        res.download(filePath, 'sales-report.xlsx', (err) => {
            if (err) console.error('Error sending Excel:', err);
            fs.unlink(filePath, () => {});
        });
    } catch (error) {
        console.error("Error generating Excel:", error);
        res.status(500).send('Failed to generate Excel');
    }
};

module.exports = {
    loadSales,
    getSalesData,
    downloadPDF,
    downloadExcel
};