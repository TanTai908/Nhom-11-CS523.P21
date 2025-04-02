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
        for (let char of word.toLowerCase()) {
            if (!node.children[char]) {
                node.children[char] = new TrieNode();
            }
            node = node.children[char];
        }
        node.isEnd = true;
    }

    search(word) {
        let node = this.root;
        for (let char of word.toLowerCase()) {
            if (!node.children[char]) return false;
            node = node.children[char];
        }
        return node.isEnd;
    }

    autocomplete(prefix) {
        let node = this.root;
        for (let char of prefix.toLowerCase()) {
            if (!node.children[char]) return [];
            node = node.children[char];
        }
        let results = [];
        this._dfs(node, prefix.toLowerCase(), results);
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

// Hàm nạp từ vào Trie từ database
async function loadTrie() {
    try {
        const result = await sql.query`SELECT word FROM Words`;
        trie.root = new TrieNode(); // Reset Trie trước khi nạp lại dữ liệu
        result.recordset.forEach(row => trie.insert(row.word));
        console.log(`✅ Đã nạp ${result.recordset.length} từ vào Trie Tree!`);
    } catch (err) {
        console.error("❌ Lỗi khi nạp từ vào Trie:", err);
    }
}

// Hàm kết nối SQL Server
async function connectDB() {
    try {
        await sql.connect(config);
        console.log("✅ Kết nối SQL Server thành công!");
        await loadTrie();
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

    // API tìm kiếm từ (trả về thông tin đầy đủ từ database)
    app.get("/search", async (req, res) => {
        const word = req.query.word?.trim().toLowerCase();
        if (!word) return res.status(400).json({ error: "❌ Chưa nhập từ cần tìm!" });
    
        try {
            const result = await sql.query`
                SELECT 
                    W.word, 
                    COALESCE((SELECT STRING_AGG(P.phonetic, ', ') 
                              FROM Phonetic P 
                              WHERE P.word_id = W.word_id), 'Không có') AS phonetic,  
                    COALESCE((SELECT STRING_AGG(WT.word_type, ', ') 
                              FROM WordTypes WT 
                              WHERE WT.word_id = W.word_id), 'Không có') AS types,
                    COALESCE((SELECT STRING_AGG(M.definition, '; ') 
                              FROM Meanings M 
                              WHERE M.word_id = W.word_id), 'Không có') AS meanings,
                    COALESCE((SELECT STRING_AGG(E.example, ' | ') 
                              FROM Examples E 
                              WHERE E.word_id = W.word_id), 'Không có') AS examples
                FROM Words W
                WHERE LOWER(W.word) = ${word}`;  
    
            if (result.recordset.length === 0) {
                return res.json({ exists: false, message: "❌ Từ không có trong từ điển!" });
            }
    
            const row = result.recordset[0];
    
            const response = {
                word: row.word,
                phonetic: row.phonetic !== 'Không có' ? row.phonetic.split(', ') : [],
                types: row.types !== 'Không có' ? row.types.split(', ') : [],
                meanings: row.meanings !== 'Không có' ? row.meanings.split('; ') : [],
                examples: row.examples !== 'Không có' ? row.examples.split(' | ') : []
            };
    
            res.json({ exists: true, data: response });
        } catch (err) {
            console.error("❌ Lỗi khi tìm từ:", err);
            res.status(500).json({ error: "❌ Lỗi khi tìm từ", details: err.message });
        }
    });
    // API lấy một từ ngẫu nhiên từ SQL
      app.get('/game-word', async (req, res) => {
        try {
            const result = await sql.query`
                SELECT TOP 1 
                    W.word, 
                    COALESCE((SELECT STRING_AGG(M.definition, '; ') 
                              FROM Meanings M 
                              WHERE M.word_id = W.word_id), 'Không có nghĩa') AS meanings
                FROM Words W
                ORDER BY NEWID();`;
              // Lấy ngẫu nhiên một từ
    
            if (result.recordset.length === 0) {
                return res.json({ error: "Không tìm thấy từ nào trong database!" });
            }
    
            const { word, meanings } = result.recordset[0];
    
            res.json({ word, meaning: meanings });
        } catch (err) {
            console.error("❌ Lỗi khi lấy từ ngẫu nhiên từ SQL:", err);
            res.status(500).json({ error: "Lỗi khi lấy từ từ SQL", details: err.message });
        }
    });
    app.get("/game-word", async (req, res) => {
        try {
            const result = await sql.query(`
                SELECT TOP 1 w.word_id, w.word, m.definition 
                FROM Words w
                JOIN Meanings m ON w.word_id = m.word_id
                WHERE w.language = 'en'
                ORDER BY NEWID();
            `);
    
            if (result.recordset.length === 0) {
                return res.status(404).json({ message: "Không có dữ liệu" });
            }
    
            let word = result.recordset[0].word.toLowerCase();
            let shuffledLetters = word.split("").sort(() => Math.random() - 0.5).join("");
    
            res.json({
                word_id: result.recordset[0].word_id,
                meaning: result.recordset[0].definition,
                shuffledLetters: shuffledLetters
            });
        } catch (error) {
            console.error("Lỗi khi lấy từ:", error);
            res.status(500).json({ message: "Lỗi server" });
        }
    });
    
    // API kiểm tra đáp án
    app.post("/check-answer", async (req, res) => {
        const { word_id, answer } = req.body;
    
        try {
            const result = await sql.query`
                SELECT word FROM Words WHERE word_id = ${word_id}
            `;
    
            if (result.recordset.length === 0) {
                return res.status(404).json({ message: "Không tìm thấy câu hỏi" });
            }
    
            let correctAnswer = result.recordset[0].word.toLowerCase();
            let isCorrect = answer.toLowerCase() === correctAnswer;
    
            res.json({ correct: isCorrect, correctAnswer: correctAnswer });
        } catch (error) {
            console.error("Lỗi kiểm tra đáp án:", error);
            res.status(500).json({ message: "Lỗi server" });
        }
    });
    app.get("/suggest", async (req, res) => {
        let prefix = req.query.prefix?.toLowerCase().trim();
        if (!prefix) return res.json([]); // Trả về danh sách rỗng nếu không có tiền tố nhập vào
    
        let words = trie.autocomplete(prefix); // Gọi phương thức autocomplete từ Trie
        res.json(words.slice(0, 10)); // Giới hạn 10 từ gợi ý
    });
    
    
    
    // API gợi ý từ dựa trên tiền tố
    app.get("/autocomplete", (req, res) => {
        const prefix = req.query.prefix?.trim().toLowerCase();
        if (!prefix) return res.status(400).json({ error: "❌ Chưa nhập tiền tố!" });
        const suggestions = trie.autocomplete(prefix);
        res.json({ suggestions });
    });
    // Lắng nghe trên cổng 3000
    const PORT = 3000;
const HOST = "10.14.30.107"; // Lắng nghe trên tất cả địa chỉ IP trong mạng
app.listen(PORT, HOST, () => {
    console.log(`✅ Server chạy tại: http://${HOST}:${PORT}`);
});


}

// Gọi hàm kết nối database
connectDB();