const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const moment = require('moment');

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

const getDashboardData = async (filters = {}) => {
    try {
        // Build query for delivered orders
        const orderQuery = { 
            status: { $in: ['Delivered', 'Completed'] } // Adjust based on your schema
          }; // Adjust this if you want to include other statuses
          if (filters.from && filters.to) {
            const startDate = new Date(filters.from);
            const endDate = new Date(filters.to);
            endDate.setHours(23, 59, 59, 999);
            
            orderQuery.deliveredDate = { 
              $gte: startDate, 
              $lte: endDate 
            };
          }

        // Get orders data
        const orders = await Order.find(orderQuery)
            .populate('items.product')
            .sort({ deliveredDate: -1 });

        // Calculate total revenue and orders
        const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const totalOrders = orders.length;

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

        const topProducts = await Product.find({ 
            _id: { $in: Object.keys(productSales) } 
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
                const categoryId = item.product?.category?.toString();
                if (categoryId) {
                    categorySales[categoryId] = (categorySales[categoryId] || 0) + item.quantity;
                }
            });
        });

        const topCategories = await Category.find({ 
            _id: { $in: Object.keys(categorySales) } 
        }).limit(10);

        const topCategoriesData = topCategories.map(category => ({
            name: category.name,
            sales: categorySales[category._id.toString()]
        })).sort((a, b) => b.sales - a.sales);

        // Prepare data for charts
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            return date;
        });

        const dailySalesData = last7Days.map(date => {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);
            
            const dayOrders = orders.filter(order => 
                order.deliveredDate >= dayStart && order.deliveredDate <= dayEnd
            );
            
            return {
                date: moment(date).format('DD/MM'),
                sales: dayOrders.reduce((sum, order) => sum + order.totalAmount, 0),
                count: dayOrders.length
            };
        });

        return {
            totalRevenue,
            totalOrders,
            topProducts: topProductsData,
            topCategories: topCategoriesData,
            dailySalesData,
            filterFrom: filters.from ? formatDate(filters.from) : null,
            filterTo: filters.to ? formatDate(filters.to) : null
        };
    } catch (error) {
        console.error('Error in getDashboardData:', error);
        throw error;
    }
};
const loadDashboard = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin');
        }

        const { period = 'today', from, to } = req.query;
        const dateRange = getDateRange(period);
        
        // Build query based on filters
        const query = { status: 'Delivered' };
        
        if (from && to) {
            const startDate = new Date(from);
            const endDate = new Date(to);
            endDate.setHours(23, 59, 59, 999);
            query.deliveredDate = { $gte: startDate, $lte: endDate };
        } else if (dateRange.from && dateRange.to) {
            const startDate = new Date(dateRange.from);
            const endDate = new Date(dateRange.to);
            endDate.setHours(23, 59, 59, 999);
            query.deliveredDate = { $gte: startDate, $lte: endDate };
        } else {
            // Default to a broader date range for testing
            query.deliveredDate = {
                $gte: ISODate("2025-03-31T00:00:00.000Z"),
                $lte: ISODate("2025-04-08T23:59:59.999Z")
            };
        }

        console.log('Final Dashboard Query:', query); // Log the final query for debugging

        // Fetch orders based on the query
        const orders = await Order.find(query).sort({ deliveredDate: -1 });
        console.log('Retrieved Orders:', orders); // Log retrieved orders

        // Calculate summary statistics
        const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const totalOrders = orders.length;
        const totalDiscount = orders.reduce((sum, order) => sum + (order.discountAmount || 0), 0);
        const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0;

        // Revenue aggregation
        const revenueStats = await Order.aggregate([
            { $match: query },
            { $group: { 
                _id: null, 
                totalRevenue: { $sum: '$totalAmount' },
                totalOrders: { $sum: 1 }
            }}
        ]);

        console.log('Revenue Stats:', revenueStats); // Log revenue stats

        const activeUsers = await User.countDocuments({ isActive: true });


        const stats = revenueStats[0] || { totalRevenue: 0, totalOrders: 0 };
        const dateDisplay = from && to 
            ? `${formatDate(from)} - ${formatDate(to)}` 
            : dateRange.from 
                ? `${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}` 
                : 'N/A - N/A';

        res.render("dashboard", {
            totalRevenue: stats.totalRevenue.toFixed(2),
            totalOrders: stats.totalOrders,
            activeUsers, // This will now have the correct count
            topProducts,
            topCategories,
            dailyData,
            dateDisplay,
            filterFrom: from || formatDate(dateRange.from),
            filterTo: to || formatDate(dateRange.to),
            period,
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
            period: 'today'
        });
    }
};


module.exports = {
    loadDashboard
};