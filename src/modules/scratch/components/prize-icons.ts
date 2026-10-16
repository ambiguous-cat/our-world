export type PrizeIconCategoryId =
  | "affection"
  | "food"
  | "dessert"
  | "meal"
  | "date"
  | "fun"
  | "company"
  | "clothing"
  | "coupon";

export type PrizeIconOption = {
  id: string;
  label: string;
  path: string;
};

export type PrizeIconCategory = {
  id: PrizeIconCategoryId;
  label: string;
  icons: PrizeIconOption[];
};

export const prizeIconCategories: PrizeIconCategory[] = [
  {
    id: "affection",
    label: "心意",
    icons: [
      { id: "gift", label: "礼物", path: "/prize-icons/gift.svg" },
      { id: "heart", label: "爱心", path: "/prize-icons/heart.svg" },
      { id: "letter", label: "情书", path: "/prize-icons/letter.svg" },
      { id: "bouquet", label: "花束", path: "/prize-icons/bouquet.svg" },
      { id: "star", label: "星星", path: "/prize-icons/star.svg" },
      { id: "crown", label: "皇冠", path: "/prize-icons/crown.svg" },
      { id: "ring", label: "戒指", path: "/prize-icons/ring.svg" },
      { id: "rose", label: "玫瑰", path: "/prize-icons/rose.svg" },
      { id: "moon", label: "月亮", path: "/prize-icons/moon.svg" },
      { id: "rainbow", label: "彩虹", path: "/prize-icons/rainbow.svg" },
      { id: "ribbon", label: "蝴蝶结", path: "/prize-icons/ribbon.svg" },
      { id: "sparkle", label: "闪闪发光", path: "/prize-icons/sparkle.svg" },
    ],
  },
  {
    id: "food",
    label: "吃喝",
    icons: [
      { id: "cake", label: "蛋糕", path: "/prize-icons/cake.svg" },
      { id: "milk-tea", label: "奶茶", path: "/prize-icons/milk-tea.svg" },
      { id: "coffee", label: "咖啡", path: "/prize-icons/coffee.svg" },
      { id: "ice-cream", label: "冰淇淋", path: "/prize-icons/ice-cream.svg" },
      { id: "hotpot", label: "火锅", path: "/prize-icons/hotpot.svg" },
      { id: "bbq", label: "烧烤", path: "/prize-icons/bbq.svg" },
      { id: "croissant", label: "可颂", path: "/prize-icons/croissant.svg" },
      { id: "fried-egg", label: "早餐", path: "/prize-icons/fried-egg.svg" },
      { id: "sandwich", label: "三明治", path: "/prize-icons/sandwich.svg" },
      { id: "popcorn", label: "爆米花", path: "/prize-icons/popcorn.svg" },
      { id: "taco", label: "塔可", path: "/prize-icons/taco.svg" },
      { id: "rice-ball", label: "饭团", path: "/prize-icons/rice-ball.svg" },
    ],
  },
  {
    id: "dessert",
    label: "水果甜品",
    icons: [
      { id: "strawberry", label: "草莓", path: "/prize-icons/strawberry.svg" },
      { id: "cherry", label: "樱桃", path: "/prize-icons/cherry.svg" },
      { id: "watermelon", label: "西瓜", path: "/prize-icons/watermelon.svg" },
      { id: "peach", label: "蜜桃", path: "/prize-icons/peach.svg" },
      { id: "grapes", label: "葡萄", path: "/prize-icons/grapes.svg" },
      { id: "apple", label: "苹果", path: "/prize-icons/apple.svg" },
      { id: "chocolate", label: "巧克力", path: "/prize-icons/chocolate.svg" },
      { id: "cookie", label: "曲奇", path: "/prize-icons/cookie.svg" },
      { id: "donut", label: "甜甜圈", path: "/prize-icons/donut.svg" },
      { id: "pudding", label: "布丁", path: "/prize-icons/pudding.svg" },
      { id: "cupcake", label: "纸杯蛋糕", path: "/prize-icons/cupcake.svg" },
      { id: "shaved-ice", label: "刨冰", path: "/prize-icons/shaved-ice.svg" },
    ],
  },
  {
    id: "meal",
    label: "正餐饮品",
    icons: [
      { id: "pizza", label: "披萨", path: "/prize-icons/pizza.svg" },
      { id: "burger", label: "汉堡", path: "/prize-icons/burger.svg" },
      { id: "sushi", label: "寿司", path: "/prize-icons/sushi.svg" },
      { id: "ramen", label: "拉面", path: "/prize-icons/ramen.svg" },
      { id: "dumpling", label: "饺子", path: "/prize-icons/dumpling.svg" },
      { id: "curry", label: "咖喱饭", path: "/prize-icons/curry.svg" },
      { id: "bento", label: "便当", path: "/prize-icons/bento.svg" },
      { id: "fries", label: "薯条", path: "/prize-icons/fries.svg" },
      { id: "beer", label: "啤酒", path: "/prize-icons/beer.svg" },
      { id: "wine", label: "红酒", path: "/prize-icons/wine.svg" },
      { id: "soda", label: "汽水", path: "/prize-icons/soda.svg" },
      { id: "tea", label: "热茶", path: "/prize-icons/tea.svg" },
    ],
  },
  {
    id: "date",
    label: "约会",
    icons: [
      { id: "movie", label: "电影", path: "/prize-icons/movie.svg" },
      { id: "music", label: "音乐", path: "/prize-icons/music.svg" },
      { id: "camera", label: "相机", path: "/prize-icons/camera.svg" },
      { id: "picnic", label: "野餐", path: "/prize-icons/picnic.svg" },
      { id: "travel", label: "旅行", path: "/prize-icons/travel.svg" },
      { id: "park", label: "游乐园", path: "/prize-icons/park.svg" },
      { id: "aquarium", label: "水族馆", path: "/prize-icons/aquarium.svg" },
      { id: "beach", label: "海边", path: "/prize-icons/beach.svg" },
      { id: "camping", label: "露营", path: "/prize-icons/camping.svg" },
      { id: "zoo", label: "动物园", path: "/prize-icons/zoo.svg" },
      { id: "concert", label: "演唱会", path: "/prize-icons/concert.svg" },
      { id: "museum", label: "看展", path: "/prize-icons/museum.svg" },
    ],
  },
  {
    id: "fun",
    label: "娱乐",
    icons: [
      { id: "game", label: "游戏", path: "/prize-icons/game.svg" },
      { id: "karaoke", label: "K歌", path: "/prize-icons/karaoke.svg" },
      { id: "board-game", label: "桌游", path: "/prize-icons/board-game.svg" },
      { id: "shopping", label: "购物", path: "/prize-icons/shopping.svg" },
      { id: "blind-box", label: "盲盒", path: "/prize-icons/blind-box.svg" },
      { id: "fireworks", label: "烟花", path: "/prize-icons/fireworks.svg" },
      { id: "book", label: "读书", path: "/prize-icons/book.svg" },
      { id: "painting", label: "画画", path: "/prize-icons/painting.svg" },
      { id: "bicycle", label: "骑行", path: "/prize-icons/bicycle.svg" },
      { id: "badminton", label: "羽毛球", path: "/prize-icons/badminton.svg" },
      { id: "bowling", label: "保龄球", path: "/prize-icons/bowling.svg" },
      { id: "puzzle", label: "拼图", path: "/prize-icons/puzzle.svg" },
    ],
  },
  {
    id: "company",
    label: "陪伴",
    icons: [
      { id: "hug", label: "拥抱", path: "/prize-icons/hug.svg" },
      { id: "kiss", label: "亲亲", path: "/prize-icons/kiss.svg" },
      { id: "walk", label: "散步", path: "/prize-icons/walk.svg" },
      { id: "massage", label: "按摩", path: "/prize-icons/massage.svg" },
      { id: "sleep", label: "睡懒觉", path: "/prize-icons/sleep.svg" },
      { id: "home", label: "一起宅家", path: "/prize-icons/home.svg" },
      { id: "cooking", label: "一起做饭", path: "/prize-icons/cooking.svg" },
      { id: "pet", label: "陪伴宠物", path: "/prize-icons/pet.svg" },
      { id: "umbrella", label: "雨天同行", path: "/prize-icons/umbrella.svg" },
      { id: "handhold", label: "牵手", path: "/prize-icons/handhold.svg" },
    ],
  },
  {
    id: "clothing",
    label: "衣着配饰",
    icons: [
      { id: "dress", label: "连衣裙", path: "/prize-icons/dress.svg" },
      { id: "tshirt", label: "上衣", path: "/prize-icons/tshirt.svg" },
      { id: "coat", label: "外套", path: "/prize-icons/coat.svg" },
      { id: "jeans", label: "裤子", path: "/prize-icons/jeans.svg" },
      { id: "sneaker", label: "运动鞋", path: "/prize-icons/sneaker.svg" },
      { id: "heels", label: "高跟鞋", path: "/prize-icons/heels.svg" },
      { id: "sun-hat", label: "遮阳帽", path: "/prize-icons/sun-hat.svg" },
      { id: "cap", label: "鸭舌帽", path: "/prize-icons/cap.svg" },
      { id: "handbag", label: "手提包", path: "/prize-icons/handbag.svg" },
      { id: "glasses", label: "眼镜", path: "/prize-icons/glasses.svg" },
      { id: "scarf", label: "围巾", path: "/prize-icons/scarf.svg" },
      { id: "socks", label: "袜子", path: "/prize-icons/socks.svg" },
    ],
  },
  {
    id: "coupon",
    label: "奖励券",
    icons: [
      { id: "ticket", label: "兑换券", path: "/prize-icons/ticket.svg" },
      { id: "wish", label: "愿望券", path: "/prize-icons/wish.svg" },
      { id: "chore", label: "免家务券", path: "/prize-icons/chore.svg" },
      { id: "breakfast", label: "早餐券", path: "/prize-icons/breakfast.svg" },
      { id: "dinner", label: "晚餐券", path: "/prize-icons/dinner.svg" },
      { id: "surprise", label: "惊喜券", path: "/prize-icons/surprise.svg" },
    ],
  },
];

export const prizeIcons = prizeIconCategories.flatMap(
  (category) => category.icons,
);
