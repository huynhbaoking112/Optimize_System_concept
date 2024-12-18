// npm install redis mongoose node-schedule


const redis = require('redis');
const mongoose = require('mongoose');
const schedule = require('node-schedule');

// Kết nối đến Redis
const redisClient = redis.createClient({
  url: 'redis://localhost:6379', // Đổi theo config của bạn
});
redisClient.on('error', (err) => console.error('Redis Error:', err));
redisClient.connect();

// Kết nối đến MongoDB
mongoose.connect('mongodb://localhost:27017/api_tracking', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Định nghĩa schema MongoDB
const RequestSchema = new mongoose.Schema({
  partner_id: String,
  date: String, // yyyy-mm-dd
  counts: Object, // Số lượng request từng giờ {1: 100, 2: 200, ...}
  total_count: Number, // Tổng số lượng request trong ngày
});

const MonthlySummarySchema = new mongoose.Schema({
  partner_id: String,
  date: String, // yyyy-mm
  counts: Object, // Số lượng request từng ngày {1: 1000, 2: 2000, ...}
  total_count: Number, // Tổng số lượng request trong tháng
});

const DailyRequests = mongoose.model('DailyRequests', RequestSchema);
const MonthlySummary = mongoose.model('MonthlySummary', MonthlySummarySchema);

// Hàm lấy và xử lý dữ liệu từ Redis
async function processHourlyData() {
  try {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hour = currentDate.getHours();

    // Key Redis theo ngày và giờ
    const redisKey = `requests:${year}-${month}-${day}:${hour}`;
    const partnerData = await redisClient.hGetAll(redisKey); // Lấy dữ liệu từ Redis

    // Xử lý từng partner
    for (const [partnerId, count] of Object.entries(partnerData)) {
      const dateKey = `${year}-${month}-${day}`;

      // Tìm và cập nhật dữ liệu trong MongoDB
      const dailyDoc = await DailyRequests.findOneAndUpdate(
        { partner_id: partnerId, date: dateKey },
        {
          $inc: {
            [`counts.${hour}`]: parseInt(count),
            total_count: parseInt(count),
          },
        },
        { upsert: true, new: true }
      );

      const monthlyDoc = await MonthlySummary.findOneAndUpdate(
        { partner_id: partnerId, date: `${year}-${month}` },
        {
          $inc: {
            [`counts.${day}`]: parseInt(count),
            total_count: parseInt(count),
          },
        },
        { upsert: true, new: true }
      );
      
  
      console.log('Updated monthly summary:', monthlyDoc);

      console.log(`Updated daily request data for partner ${partnerId}:`, dailyDoc);
    }

    // Xóa dữ liệu Redis sau khi xử lý
    await redisClient.del(redisKey);
  } catch (error) {
    console.error('Error processing hourly data:', error);
  }
}

// Lên lịch chạy service mỗi giờ cứ phút 59 sẽ tổng kết 1 lần
// Minute  Hour  DayOfMonth  Month  DayOfWeek
schedule.scheduleJob('59 * * * *', () => {
  console.log(`Running hourly data processing at ${new Date()}`);
  processHourlyData();
});




// Giải thích mã nguồn
// Xử lý từng giờ:

// Lấy dữ liệu từ Redis theo từng giờ với key theo định dạng requests:yyyy-mm-dd:hour.
// Cập nhật dữ liệu trong MongoDB:
// Tăng số lượng request theo giờ.
// Tăng tổng số lượng request trong ngày.
// Sau khi xử lý, xóa dữ liệu Redis bằng lệnh DEL để giải phóng bộ nhớ.
// Xử lý hàng tháng:

// Lấy dữ liệu hàng ngày từ MongoDB cho một tháng cụ thể.
// Tổng hợp số lượng request theo từng ngày và tổng số lượng trong tháng.
// Lưu kết quả vào bảng MonthlySummary.
// Lên lịch:

// Hàng giờ: Xử lý dữ liệu Redis vào đầu mỗi giờ (0 * * * *).
// Hàng tháng: Tổng hợp dữ liệu hàng tháng vào lúc 0h ngày đầu tiên mỗi tháng (0 0 1 * *).
// Lưu ý
// Redis Key TTL:
// Đặt TTL hợp lý cho Redis keys để tránh việc Redis lưu trữ dữ liệu cũ quá lâu.

// Bảo mật:
// Đảm bảo Redis và MongoDB chỉ cho phép các kết nối từ những địa chỉ được xác định.