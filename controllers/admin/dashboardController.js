// controllers/admin/dashboardController.js
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const moment = require('moment');


// Add this function to your dashboardController.js
function getChartColor(index) {
    const colors = [
        '#f44336', '#ff9800', '#3f51b5', '#9c27b0', '#4db6ac',
        '#8bc34a', '#00bcd4', '#607d8b', '#795548', '#e91e63'
    ];
    return colors[index % colors.length];
}



// Helper functions
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const pad = num => num.toString().padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}


function getDateRange(period) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = new Date(today);
    
    switch(period) {
        case 'today':
            return { from: today, to: today };
        case 'yesterday':
            fromDate.setDate(today.getDate() - 1);
            return { from: fromDate, to: fromDate };
        case 'week':
            fromDate.setDate(today.getDate() - 7);
            return { from: fromDate, to: today };
        case 'month':
            fromDate.setMonth(today.getMonth() - 1);
            return { from: fromDate, to: today };
        default:
            return { from: null, to: null };
    }
}

// Generate dates between two dates
function getDatesInRange(startDate, endDate) {
    const dates = [];
    const currentDate = new Date(startDate);
    
    // Ensure we include the end date
    const lastDate = new Date(endDate);
    lastDate.setHours(23, 59, 59, 999);
    
    while (currentDate <= lastDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
}

const loadDashboard = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin');
        }

        const { period = 'today', from, to } = req.query;
        const dateRange = getDateRange(period);
        
        // Build query based on filters
        const query = { status: 'Delivered' };
        let startDate, endDate;
        
        if (from && to) {
            startDate = new Date(from);
            endDate = new Date(to);
            endDate.setHours(23, 59, 59, 999);
            query.deliveredDate = { $gte: startDate, $lte: endDate };
        } else if (dateRange.from && dateRange.to) {
            startDate = new Date(dateRange.from);
            endDate = new Date(dateRange.to);
            endDate.setHours(23, 59, 59, 999);
            query.deliveredDate = { $gte: startDate, $lte: endDate };
        } else {
            // Default to last 30 days if no date range specified
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            endDate = new Date();
            query.deliveredDate = { $gte: startDate, $lte: endDate };
        }

        console.log('Dashboard Query:', query);

        // Fetch orders based on the query
        const orders = await Order.find(query)
            .populate({
                path: 'items.product',
                populate: {
                    path: 'category',
                    model: 'Category'
                }
            })
            .sort({ deliveredDate: -1 });

        console.log(`Retrieved ${orders.length} orders`);

        // Calculate summary statistics
        const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const totalOrders = orders.length;

        // Get active users count
        const activeUsers = await User.countDocuments({ isActive: true });

        // Get top selling products
        const productSales = {};
        orders.forEach(order => {
            order.items.forEach(item => {
                const productId = item.product?._id?.toString();
                if (productId) {
                    productSales[productId] = (productSales[productId] || 0) + item.quantity;
                }
            });
        });

        const topProductIds = Object.keys(productSales);
        const topProducts = await Product.find({ 
            _id: { $in: topProductIds } 
        }).limit(10);

        const topProductsData = topProducts.map(product => ({
            name: product.productName,
            sales: productSales[product._id.toString()],
            revenue: product.price * productSales[product._id.toString()]
        })).sort((a, b) => b.sales - a.sales);

        // Get top selling categories
        const categorySales = {};
        orders.forEach(order => {
            order.items.forEach(item => {
                if (item.product && item.product.category) {
                    const categoryId = typeof item.product.category === 'object' 
                        ? item.product.category._id.toString() 
                        : item.product.category.toString();
                    
                    if (categoryId) {
                        categorySales[categoryId] = (categorySales[categoryId] || 0) + item.quantity;
                    }
                }
            });
        });

        const topCategoryIds = Object.keys(categorySales);
        const topCategories = await Category.find({ 
            _id: { $in: topCategoryIds } 
        }).limit(10);

        const topCategoriesData = topCategories.map(category => ({
            name: category.name,
            sales: categorySales[category._id.toString()]
        })).sort((a, b) => b.sales - a.sales);

        // Generate all dates in the selected range for the chart
        const datesInRange = getDatesInRange(startDate, endDate);
        
        // Prepare data for charts - use all dates in the selected range
        const dailyData = datesInRange.map(date => {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);
            
            // Find orders for this specific day
            const dayOrders = orders.filter(order => {
                const orderDate = new Date(order.deliveredDate);
                return orderDate >= dayStart && orderDate <= dayEnd;
            });
            
            const daySales = dayOrders.reduce((sum, order) => sum + order.totalAmount, 0);
            
            return {
                date: moment(date).format('DD/MM'),
                fullDate: moment(date).format('YYYY-MM-DD'),
                sales: daySales,
                count: dayOrders.length
            };
        });

        console.log('Daily data points:', dailyData.length);
        console.log('Sample daily data:', dailyData.slice(0, 3));

        const dateDisplay = from && to 
            ? `${formatDate(from)} - ${formatDate(to)}` 
            : dateRange.from 
                ? `${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}` 
                : 'Last 30 days';

        res.render("dashboard", {
            totalRevenue: totalRevenue.toFixed(2),
            totalOrders,
            activeUsers,
            topProducts: topProductsData,
            topCategories: topCategoriesData,
            dailyData,
            dateDisplay,
            filterFrom: from || (dateRange.from ? formatDate(dateRange.from) : ''),
            filterTo: to || (dateRange.to ? formatDate(dateRange.to) : ''),
            period,
            getChartColor, // Add this line to pass the function
            error: null
        });

    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).render("dashboard", { 
            error: "Failed to load dashboard data",
            totalRevenue: 0,
            totalOrders: 0,
            activeUsers: 0,
            topProducts: [],
            topCategories: [],
            dailyData: [],
            dateDisplay: 'N/A - N/A',
            filterFrom: '',
            filterTo: '',
            period: 'today',
            getChartColor // Add this line to pass the function in error case too
        });
    }
};

module.exports = {
    loadDashboard
};