import { mergeExtensionData, EXTENSION_AMENITIES_KEY } from "../src/lib/extension-bridge.ts";
import type { BusinessProfile } from "../src/lib/types.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const mockProfile: BusinessProfile = {
  title: "Quán Cơm Tấm Sài Gòn",
  place_id: "ChIJ_test_123",
  data_id: "0x123:0x456",
  address: "123 Nguyễn Tri Phương, Q.5, TP.HCM",
  country: "VN",
  plus_code: "8Q8G+XX TP.HCM",
  phone: "0901234567",
  website: "https://comtamsaigon.vn",
  maps_link: "https://maps.google.com/?cid=123456",
  thumbnail: "https://lh3.googleusercontent.com/test",
  types: ["Nhà hàng Việt Nam", "Quán ăn gia đình"],
  description: "Cơm tấm sườn bì chả đặc sản",
  rating: 4.5,
  reviews_count: 320,
  rating_summary: [
    { stars: 5, amount: 200 },
    { stars: 4, amount: 80 },
    { stars: 3, amount: 20 },
    { stars: 2, amount: 10 },
    { stars: 1, amount: 10 },
  ],
  price: "35.000 - 65.000 ₫",
  price_details: null,
  open_state: "Đang mở cửa",
  hours: [
    { day: "Thứ Hai", time: "06:00–21:00" },
    { day: "Thứ Ba", time: "06:00–21:00" },
  ],
  gps: { latitude: 10.755, longitude: 106.667 },
  booking_links: [],
  menu: null,
  extensions: [
    {
      key: "service_options",
      items: ["Ăn tại chỗ", "Mang về"],
    },
  ],
  images: [],
  user_reviews: [],
  popular_times: null,
  similar_places: [],
  unclaimed: false,
};

Deno.test("mergeExtensionData: Ghép thực đơn chữ khi profile.menu ban đầu là null", () => {
  const result = mergeExtensionData(mockProfile, {
    menu: {
      categories: [
        {
          section: "Món chính",
          items: [
            { name: "Cơm tấm sườn bì chả", description: "Ăn kèm đồ chua", price: "55.000 ₫" },
            { name: "Cơm sườn nướng", description: "", price: "45.000 ₫" },
          ],
        },
        {
          section: "Đồ uống",
          items: [{ name: "Trà đá", description: "", price: "5.000 ₫" }],
        },
      ],
      menuPhotosOnly: false,
      source: "script",
    },
  });

  equal(result.menu_source_note, "maps_logged_in");
  equal(result.menu?.categories.length, 2);
  equal(result.menu?.categories[0].title, "Món chính");
  equal(result.menu?.categories[0].items[0].title, "Cơm tấm sườn bì chả");
  equal(result.menu?.categories[0].items[0].price, "55.000 ₫");
  equal(result.menu?.categories[0].items[0].description, "Ăn kèm đồ chua");
  equal(result.menu?.categories[1].title, "Đồ uống");
  equal(result.menu?.categories[1].items[0].title, "Trà đá");
});

Deno.test("mergeExtensionData: Ghi nhận menuPhotosOnly khi quán chỉ có ảnh menu", () => {
  const result = mergeExtensionData(mockProfile, {
    menu: {
      categories: [],
      menuPhotosOnly: true,
      source: "script",
    },
  });

  equal(result.menu_source_note, "maps_logged_in_photos_only");
  equal(result.menu?.categories.length, 0);
});

Deno.test("mergeExtensionData: Ghép tiện ích có (available) và không có (unavailable)", () => {
  const result = mergeExtensionData(mockProfile, {
    attributes: {
      available: [
        { group: "Thanh toán", label: "Chỉ dùng tiền mặt" },
        { group: "Tiện nghi", label: "Có Wi-Fi miễn phí" },
      ],
      unavailable: [
        { group: "Thanh toán", label: "Thẻ tín dụng" },
        { group: "Hỗ trợ tiếp cận", label: "Lối vào cho xe lăn" },
      ],
      source: "script",
    },
  });

  // Giữ nguyên các extension cũ
  equal(result.extensions.some((g) => g.key === "service_options"), true);

  // Thêm nhóm Tiện ích (Maps đăng nhập) vào extensions
  const loggedInExt = result.extensions.find((g) => g.key === EXTENSION_AMENITIES_KEY);
  equal(Boolean(loggedInExt), true);
  equal(loggedInExt?.items, [
    "Thanh toán: Chỉ dùng tiền mặt",
    "Tiện nghi: Có Wi-Fi miễn phí",
  ]);

  // Thêm vào unsupported_extensions
  const loggedInUnsupp = result.unsupported_extensions?.find((g) => g.key === EXTENSION_AMENITIES_KEY);
  equal(Boolean(loggedInUnsupp), true);
  equal(loggedInUnsupp?.items, [
    "Thanh toán: Thẻ tín dụng",
    "Hỗ trợ tiếp cận: Lối vào cho xe lăn",
  ]);
});

Deno.test("mergeExtensionData: Gộp không trùng lặp khi đã có nhóm Tiện ích (Maps đăng nhập)", () => {
  const profileWithExistingExt: BusinessProfile = {
    ...mockProfile,
    extensions: [
      {
        key: EXTENSION_AMENITIES_KEY,
        items: ["Thanh toán: Chỉ dùng tiền mặt"],
      },
    ],
  };

  const result = mergeExtensionData(profileWithExistingExt, {
    attributes: {
      available: [
        { group: "Thanh toán", label: "Chỉ dùng tiền mặt" }, // Trùng
        { group: "Dịch vụ", label: "Giao hàng tận nơi" }, // Mới
      ],
    },
  });

  const group = result.extensions.find((g) => g.key === EXTENSION_AMENITIES_KEY);
  equal(group?.items, [
    "Thanh toán: Chỉ dùng tiền mặt",
    "Dịch vụ: Giao hàng tận nơi",
  ]);
});

Deno.test("mergeExtensionData: Ghép Giờ đặc biệt (special_hours)", () => {
  const special = [
    "24 thg 12: Đóng cửa",
    "25 thg 12: 10:00–18:00",
    "31 thg 12: 06:00–22:00",
  ];

  const result = mergeExtensionData(mockProfile, {
    special_hours: special,
    special_hours_source: "script",
  });

  equal(result.special_hours, special);
});

Deno.test("mergeExtensionData: Tính thuần khiết (immutability) và trường hợp dữ liệu rỗng", () => {
  const originalCopy = JSON.parse(JSON.stringify(mockProfile));

  const resultEmpty = mergeExtensionData(mockProfile, undefined);
  equal(resultEmpty.title, mockProfile.title);
  equal(JSON.stringify(mockProfile), JSON.stringify(originalCopy));

  const resultFull = mergeExtensionData(mockProfile, {
    menu: {
      categories: [{ section: "Món", items: [{ name: "Phở", price: "40.000 ₫" }] }],
    },
    attributes: {
      available: [{ group: "Chung", label: "Máy lạnh" }],
    },
    special_hours: ["1 thg 1: Đóng cửa"],
  });

  // Đối tượng gốc không bị thay đổi
  equal(mockProfile.menu, null);
  equal(mockProfile.special_hours, undefined);
  equal(JSON.stringify(mockProfile), JSON.stringify(originalCopy));

  // Kết quả mới nhận đủ các trường
  equal(resultFull.menu_source_note, "maps_logged_in");
  equal(resultFull.menu?.categories[0].items[0].title, "Phở");
  equal(resultFull.extensions.some((g) => g.key === EXTENSION_AMENITIES_KEY), true);
  equal(resultFull.special_hours, ["1 thg 1: Đóng cửa"]);
});

Deno.test("Menu chữ từ Maps đăng nhập thay danh sách món nổi bật: Text Menu và Tiện ích được chấm", async () => {
  const { scoringScope } = await import("../src/lib/audit/audit.ts");
  const base = { title: "Quán", menu_origin: "google_dishes", menu: { categories: [{ title: "Món", items: [{ title: "Pad Thai", price: "", description: "" }] }], highlights: [] },
    extensions: [{ key: "accessibility", items: ["Lối vào cho xe lăn"] }], types: ["Nhà hàng"],
    enrichment: { knowledge_graph: "ok", reviews: "ok", posts: "ok", photos: "ok", dishes: "ok" } } as unknown as Parameters<typeof mergeExtensionData>[0];
  const merged = mergeExtensionData(base, {
    menu: { categories: [{ section: "Combo Sum Vầy Hải Sản", items: [{ name: "Cá Hồi (Salmon)", description: "Cá hồi nướng", price: "" }] }] },
    attributes: { available: [{ group: "Tùy chọn dịch vụ", label: "Ăn tại chỗ" }], unavailable: [] },
  } as unknown as Parameters<typeof mergeExtensionData>[1]);
  if (merged.menu_origin !== undefined) throw new Error("menu_origin phải bị xóa");
  const names = scoringScope(merged).excluded.map((e: { pillar: string; name: string }) => `${e.pillar}.${e.name}`);
  if (names.includes("II.2. Số Hóa Menu - Text Menu") || names.includes("I.5. Tiện Ích Thuộc Tính")) throw new Error(`Vẫn bị loại: ${names.join(", ")}`);
});

Deno.test("Chỉ đi lấy mục còn thiếu: đã có menu chữ / tiện ích / giờ đặc biệt từ extension thì bỏ qua", async () => {
  const { missingSections, EXTENSION_AMENITIES_KEY: KEY } = await import("../src/lib/extension-bridge.ts");
  const base = { extensions: [], menu: null } as unknown as Parameters<typeof missingSections>[0];
  const all = missingSections(base);
  if (all.join() !== "menu,attributes,special_hours") throw new Error(all.join());
  const filled = { ...base, menu_source_note: "maps_logged_in", extensions: [{ key: KEY, items: ["Ăn tại chỗ"] }], special_hours: [] } as unknown as Parameters<typeof missingSections>[0];
  if (missingSections(filled).length !== 0) throw new Error(missingSections(filled).join());
});

Deno.test("Maps đăng nhập không có menu chữ (chỉ món nổi bật/link ngoài): ghi nhận đã kiểm tra, không đi lấy lại", async () => {
  const { missingSections } = await import("../src/lib/extension-bridge.ts");
  const base = { extensions: [], menu: null } as unknown as Parameters<typeof mergeExtensionData>[0];
  const merged = mergeExtensionData(base, { menu: { categories: [], menuPhotosOnly: false, noTextMenu: true } });
  equal(merged.menu_source_note, "maps_logged_in_no_text_menu");
  if (missingSections(merged).includes("menu")) throw new Error("menu đã kiểm tra mà vẫn đòi lấy lại");
});

Deno.test("Extension cài tay không tự cập nhật: web nhận ra bản cũ hơn bản cần", async () => {
  const { isExtensionOutdated, REQUIRED_EXTENSION_VERSION } = await import("../src/lib/extension-bridge.ts");
  equal(isExtensionOutdated(undefined), true);
  equal(isExtensionOutdated("1.0.0"), true);
  equal(isExtensionOutdated(REQUIRED_EXTENSION_VERSION), false);
  equal(isExtensionOutdated("1.10.0"), false);
  equal(isExtensionOutdated("2.0.0"), false);
});
