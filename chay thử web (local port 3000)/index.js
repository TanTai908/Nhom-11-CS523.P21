// Import các thư viện cần thiết
const express = require("express"); // Framework để tạo server Node.js
const path = require("path"); // Module hỗ trợ thao tác với đường dẫn file
const bodyParser = require("body-parser"); // Middleware để xử lý dữ liệu từ request body
const cors = require("cors"); // Middleware để cho phép truy cập từ domain khác
const sql = require("mssql"); // Thư viện kết nối với SQL Server
require("dotenv").config(); // Hỗ trợ đọc biến môi trường từ file .env

// Cấu hình kết nối SQL Server
const config = {
    user: "sa",         // Tên user trong SQL Server
    password: "MatKhauMoiCuaBan",  // Mật khẩu của SQL Server
    server: "LAPTOP-9K0RRUKB", // Tên máy chủ SQL Server
    database: "DictionaryDB", // Tên database chứa dữ liệu từ điển
    options: {
        encrypt: false,  // Tắt mã hóa kết nối (cần thiết nếu không sử dụng SSL)
        trustServerCertificate: true, // Cho phép tin tưởng chứng chỉ máy chủ
    },
};

// Khởi tạo ứng dụng Express
const app = express();
app.use(cors()); // Cho phép truy cập API từ domain khác
app.use(bodyParser.json()); // Hỗ trợ xử lý dữ liệu JSON từ client
app.use(express.static(__dirname)); // Cho phép phục vụ file tĩnh (HTML, CSS, JS)

// Định nghĩa cấu trúc Trie Node
class TrieNode {
    constructor() {
        this.children = {}; // Danh sách con của node hiện tại
        this.isEnd = false; // Đánh dấu nếu đây là điểm cuối của một từ
    }
}

// Định nghĩa cấu trúc Trie Tree
class Trie {
    constructor() {
        this.root = new TrieNode(); // Gốc của Trie Tree
    }

    // Hàm thêm từ vào Trie
    insert(word) {
        let node = this.root;
        for (let char of word) {
            if (!node.children[char]) {
                node.children[char] = new TrieNode();
            }
            node = node.children[char];
        }
        node.isEnd = true; // Đánh dấu kết thúc một từ
    }

    // Hàm kiểm tra từ có tồn tại không
    search(word) {
        let node = this.root;
        for (let char of word) {
            if (!node.children[char]) return false;
            node = node.children[char];
        }
        return node.isEnd;
    }

    // Hàm gợi ý từ dựa trên tiền tố (autocomplete)
    autocomplete(prefix) {
        let node = this.root;
        for (let char of prefix) {
            if (!node.children[char]) return []; // Nếu tiền tố không tồn tại, trả về mảng rỗng
            node = node.children[char];
        }

        let results = [];
        this._dfs(node, prefix, results); // Tìm tất cả từ có tiền tố này
        return results;
    }

    // Duyệt cây Trie để tìm các từ có tiền tố cho trước
    _dfs(node, word, results) {
        if (node.isEnd) results.push(word);
        for (let char in node.children) {
            this._dfs(node.children[char], word + char, results);
        }
    }
}

// Tạo một thể hiện Trie
const trie = new Trie();

// Hàm kết nối SQL Server
async function connectDB() {
    try {
        await sql.connect(config);
        console.log("✅ Kết nối SQL Server thành công!");

        // Lấy danh sách từ trong database và thêm vào Trie Tree
        const result = await sql.query`SELECT word FROM Words`;
        result.recordset.forEach(row => trie.insert(row.word));

        console.log(`✅ Đã nạp ${result.recordset.length} từ vào Trie Tree!`);

        startServer(); // Sau khi kết nối thành công, khởi động server
    } catch (err) {
        console.error("❌ Lỗi kết nối SQL Server:", err);
        process.exit(1); // Thoát chương trình nếu không kết nối được
    }
}

// Hàm khởi động server
function startServer() {
    // API phục vụ file HTML trang chủ
    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, "index.html"));
    });

    // API thêm từ vào Trie và database
    app.post("/add_word", async (req, res) => {
        const { word } = req.body;
        if (!word) return res.status(400).json({ error: "❌ Từ không hợp lệ!" });

        try {
            // Kiểm tra từ có trong database chưa
            const result = await sql.query`SELECT word FROM Words WHERE word = ${word}`;
            if (result.recordset.length > 0) {
                return res.json({ message: `⚠️ Từ '${word}' đã tồn tại!` });
            }

            // Thêm từ vào database
            await sql.query`INSERT INTO Words (word) VALUES (${word})`;

            // Thêm từ vào Trie
            trie.insert(word);

            res.json({ message: `✅ Đã thêm từ: ${word}` });
        } catch (err) {
            res.status(500).json({ error: "❌ Lỗi khi thêm từ", details: err.message });
        }
    });

    // API kiểm tra từ có tồn tại trong Trie không
    app.get("/search", (req, res) => {
        const word = req.query.word;
        if (!word) return res.status(400).json({ error: "❌ Chưa nhập từ cần tìm!" });

        const exists = trie.search(word);
        res.json({ exists });
    });

    // API kiểm tra từ có tồn tại trong database không
    app.get("/search_db", async (req, res) => {
        const word = req.query.word;
        if (!word) return res.status(400).json({ error: "❌ Chưa nhập từ cần tìm!" });

        try {
            const result = await sql.query`SELECT * FROM Words WHERE word = ${word}`;
            res.json({ exists: result.recordset.length > 0 });
        } catch (err) {
            res.status(500).json({ error: "❌ Lỗi khi tìm từ", details: err.message });
        }
    });

    // API gợi ý từ dựa trên tiền tố
    app.get("/autocomplete", (req, res) => {
        const prefix = req.query.prefix;
        if (!prefix) return res.status(400).json({ error: "❌ Chưa nhập tiền tố!" });

        const suggestions = trie.autocomplete(prefix);
        res.json({ suggestions });
    });

    // Lắng nghe trên cổng 3000
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`✅ Server chạy tại: http://localhost:${PORT}`);
    });
}

// Gọi hàm kết nối database để bắt đầu quá trình khởi động server
connectDB();


