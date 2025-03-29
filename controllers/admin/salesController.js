const Order = require('../../models/orderSchema');


// Helper function moved directly into controller
function formatDate(date) {
    if (!date) return '';
    
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}

// Date range calculation function
function getDateRange(period) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = new Date(today);
    
    switch(period) {
        case 'today':
            return {
                from: formatDate(today),
                to: formatDate(today)
            };
        case 'week':
            fromDate.setDate(today.getDate() - 7);
            return {
                from: formatDate(fromDate),
                to: formatDate(today)
            };
        case 'month':
            fromDate.setMonth(today.getMonth() - 1);
            return {
                from: formatDate(fromDate),
                to: formatDate(today)
            };
        case 'year':
            fromDate.setFullYear(today.getFullYear() - 1);
            return {
                from: formatDate(fromDate),
                to: formatDate(today)
            };
        default:
            return {
                from: '',
                to: ''
            };
    }
}

const loadSales = async (req, res) => {
    try {
        const { from, to, period = 'custom' } = req.query;
        let dateRange = {};
        
        if (period !== 'custom') {
            dateRange = getDateRange(period);
        } else if (from && to) {
            dateRange = { from, to };
        }

        // Fetch initial data
        const orders = await Order.find({ status: 'Delivered' })
                .populate('user', 'name')
                .sort({ 
                    deliveryDate: -1,  // Primary sort by delivery date (newest first)
                    createdAt: -1      // Secondary sort by creation date (if delivery dates are equal)
                })
                .limit(10);

        res.render("sales", {
            filterFrom: dateRange.from || '',
            filterTo: dateRange.to || '',
            filterPeriod: period,
            initialOrders: orders.map((order, index) => ({
                sNo: index + 1,
                name: order.user?.name || 'Guest',
                deliveryDate: formatDate(order.deliveryDate),
                productsCount: order.items?.length || 0,
                totalCost: order.totalAmount || 0,
                paymentMethod: order.paymentMethod || 'Unknown'
            })),
            error: null
        });
    } catch (error) {
        console.error("Error loading sales page:", error);
        res.status(500).render("sales", {
            error: "Failed to load sales data",
            filterFrom: '',
            filterTo: '',
            filterPeriod: 'custom',
            initialOrders: []
        });
    }
};

const getSalesData = async (req, res) => {
    try {
        console.log("Entering getSalesData"); // Debug
        const { from, to, period = 'custom' } = req.query;
        console.log("Received filters:", { from, to, period });

        let dateRange = {};
        if (period !== 'custom') {
            dateRange = getDateRange(period);
        } else if (from && to) {
            dateRange = { from, to };
        }
        console.log("Calculated date range:", dateRange);

        const query = { status: 'delivered' };
        console.log("Initial query:", query);

        if (dateRange.from && dateRange.to) {
            const startDate = new Date(dateRange.from);
            const endDate = new Date(dateRange.to);
            endDate.setHours(23, 59, 59, 999);
            
            query.deliveryDate = {
                $gte: startDate,
                $lte: endDate
            };
            console.log("Date query added:", query.deliveryDate);
        }

        console.log("Final query being sent to DB:", query);
        
        // Test a simple query first
        const testOrders = await Order.find({}).limit(1);
        console.log("Test order query result:", testOrders);
        
        const orders = await Order.find(query)
        .populate('user', 'name')
        .sort({ 
            deliveryDate: -1,  // Newest deliveries first
            updatedAt: -1      // Fallback sorting
        });
        
        console.log(`Found ${orders.length} orders matching query`);
        
        if (orders.length === 0) {
            console.log("No orders found - possible issues:");
            console.log("- Status not 'delivered'");
            console.log("- Date range too narrow");
            console.log("- No orders in database");
        }

        // Rest of your code...
    } catch (error) {
        console.error("Detailed error in getSalesData:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};


const downloadPDF = async (req, res) => {
    try {
        // Implement PDF generation logic here
        // This is a placeholder - you'll need to use a library like pdfkit or puppeteer
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
        // Generate PDF and pipe to response
        // pdfGenerator().pipe(res);
        res.status(501).send('PDF generation not yet implemented');
    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).send('Failed to generate PDF');
    }
};

const downloadExcel = async (req, res) => {
    try {
        // Implement Excel generation logic here
        // This is a placeholder - you'll need to use a library like exceljs
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
        // Generate Excel and send
        // await excelGenerator(res);
        res.status(501).send('Excel generation not yet implemented');
    } catch (error) {
        console.error("Error generating Excel:", error);
        res.status(500).send('Failed to generate Excel');
    }
};

// Helper function to calculate date ranges
function getDateRange(period) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = new Date(today);
    
    switch(period) {
        case 'today':
            return {
                from: formatDate(today),
                to: formatDate(today)
            };
        case 'week':
            fromDate.setDate(today.getDate() - 7);
            return {
                from: formatDate(fromDate),
                to: formatDate(today)
            };
        case 'month':
            fromDate.setMonth(today.getMonth() - 1);
            return {
                from: formatDate(fromDate),
                to: formatDate(today)
            };
        case 'year':
            fromDate.setFullYear(today.getFullYear() - 1);
            return {
                from: formatDate(fromDate),
                to: formatDate(today)
            };
        default:
            return {
                from: '',
                to: ''
            };
    }
}

module.exports = {
    loadSales,
    getSalesData,
    downloadPDF,
    downloadExcel
};