// Import các thư viện cần thiết
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const sql = require("mssql");
require("dotenv").config();

// Cấu hình kết nối SQL Server
const config = {
    user: "sa",
    password: "MatKhauMoi!",
    server: "LAPTOP-9K0RRUKB",
    database: "DictionaryDB",
    options: {
        encrypt: false,
        trustServerCertificate: true,
    },
};

// Khởi tạo ứng dụng Express
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Định nghĩa Trie Node
class TrieNode {
    constructor() {
        this.children = {};
        this.isEnd = false;
    }
}

// Định nghĩa Trie Tree
class Trie {
    constructor() {
        this.root = new TrieNode();
    }

    insert(word) {
        let node = this.root;
        for (let char of word) {
            if (!node.children[char]) {
                node.children[char] = new TrieNode();
            }
            node = node.children[char];
        }
        node.isEnd = true;
    }

    search(word) {
        let node = this.root;
        for (let char of word) {
            if (!node.children[char]) return false;
            node = node.children[char];
        }
        return node.isEnd;
    }

    autocomplete(prefix) {
        let node = this.root;
        for (let char of prefix) {
            if (!node.children[char]) return [];
            node = node.children[char];
        }

        let results = [];
        this._dfs(node, prefix, results);
        return results;
    }

    _dfs(node, word, results) {
        if (node.isEnd) results.push(word);
        for (let char in node.children) {
            this._dfs(node.children[char], word + char, results);
        }
    }
}

// Tạo Trie Tree
const trie = new Trie();

// Hàm kết nối SQL Server
async function connectDB() {
    try {
        await sql.connect(config);
        console.log("✅ Kết nối SQL Server thành công!");

        // Lấy danh sách từ trong database và thêm vào Trie
        const result = await sql.query`SELECT word FROM Words`;
        result.recordset.forEach(row => trie.insert(row.word));

        console.log(`✅ Đã nạp ${result.recordset.length} từ vào Trie Tree!`);
        startServer();
    } catch (err) {
        console.error("❌ Lỗi kết nối SQL Server:", err);
        process.exit(1);
    }
}

// Hàm khởi động server
function startServer() {
    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, "index.html"));
    });

    // API thêm từ vào Trie và database
    app.post("/add_word", async (req, res) => {
        const { word } = req.body;
        if (!word) return res.status(400).json({ error: "❌ Từ không hợp lệ!" });

        try {
            const added = await addWordToDB(word);
            if (!added) {
                return res.json({ message: `⚠️ Từ '${word}' đã tồn tại trong database!` });
            }

            trie.insert(word);
            res.json({ message: `✅ Đã thêm từ: ${word}` });
        } catch (err) {
            res.status(500).json({ error: "❌ Lỗi khi thêm từ", details: err.message });
        }
    });

    // Hàm thêm từ vào database
    async function addWordToDB(word) {
        try {
            const result = await sql.query`SELECT word FROM Words WHERE word = ${word}`;
            if (result.recordset.length > 0) return false;

            await sql.query`INSERT INTO Words (word) VALUES (${word})`;
            return true;
        } catch (err) {
            console.error("❌ Lỗi khi lưu từ vào SQL:", err);
            throw err;
        }
    }

    // API tìm kiếm từ (trả về thông tin đầy đủ từ database)
    app.get("/search", async (req, res) => {
        const word = req.query.word;
        if (!word) return res.status(400).json({ error: "❌ Chưa nhập từ cần tìm!" });

        try {
            const result = await sql.query`
                SELECT 
                    W.word, WT.type, M.definition, E.example
                FROM Words W
                JOIN WordTypes WT ON W.word_id = WT.word_id
                JOIN Meanings M ON W.word_id = M.word_id
                LEFT JOIN Examples E ON W.word_id = E.word_id
                WHERE W.word = ${word}`;

            if (result.recordset.length === 0) {
                return res.json({ exists: false, message: "❌ Từ không có trong từ điển!" });
            }

            const response = {
                word: word,
                types: [...new Set(result.recordset.map(row => row.type))],
                meanings: [...new Set(result.recordset.map(row => row.definition))],
                examples: [...new Set(result.recordset.map(row => row.example))]
            };

            res.json({ exists: true, data: response });
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

// Gọi hàm kết nối database
connectDB();


