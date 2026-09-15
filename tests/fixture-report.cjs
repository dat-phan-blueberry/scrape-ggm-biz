// Nội dung cố định cho kiểm thử UI; không phải kết quả thẩm định của Gemini.
module.exports = profile => `## Đánh giá tổng quan
Hồ sơ của ${profile.title} có thông tin để khách tham khảo trước khi lựa chọn. Cần đối chiếu trải nghiệm thực tế với nhà hàng khi tư vấn.
## Điểm mạnh
Khách có thể xem thông tin liên hệ và các nhận xét thu thập được trên hồ sơ. Những thông tin này giúp chuẩn bị trước chuyến ghé quán.
## Cơ hội cải thiện
Cùng chủ quán rà soát thông tin mà khách thường hỏi trước khi quyết định đặt bàn, rồi ưu tiên cập nhật nội dung đã xác nhận.
## Đánh giá về Text Menu
${profile.menu?.categories?.some(c => c.items.length) ? "Đã thu thập danh sách món dạng chữ; có thể đối chiếu tên, giá, mô tả và nhóm món với thực đơn đang dùng." : "Chưa thu thập được danh sách món dạng chữ; chưa đánh giá được tên, giá, mô tả hoặc cách nhóm món. Cần kiểm tra thực đơn thực tế cùng chủ quán."}
## Khuyến nghị hành động
Dùng điện thoại để kiểm tra thông tin thực đơn và liên hệ, ghi lại chỗ khách cần hỏi thêm để chủ quán cân nhắc cải thiện.
## Điểm cạnh tranh: 7.5/10
Đây là nội dung kiểm thử giao diện, không phải điểm thẩm định thực tế của nhà hàng.`;
