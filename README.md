# DeSpeed Auto Bot

An automated speed test reporting tool for the DeSpeed platform that performs periodic network speed measurements and reports them automatically.

## 🌟 Features

- Automated speed testing using MLab's NDT7 protocol
- Support for HTTP and SOCKS (4/5) proxies
- Configurable test intervals
- Random location generation within specified bounds
- Detailed console logging with color-coded output
- Token-based authentication
- Automatic error handling and retry mechanisms

## 📋 Prerequisites

- Node.js (v14 or higher)
- A valid DeSpeed token
- (Optional) Proxy configuration

## 🚀 Installation

1. Clone the repository:
```bash
git clone https://github.com/airdropinsiders/DeSpeed-Auto-Bot.git
cd DeSpeed-Auto-Bot
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Configure proxy:
Create a `proxy.txt` file in the root directory and add your proxy URL in the format:
```
http://user:pass@ip:port
# or
socks5://ip:port
```

4. Input your token
Fill with your tokens
```bash
nano token.txt
```

## ⚙️ Configuration

When you run the bot for the first time, it will prompt you for:
- DeSpeed token
- Proxy configuration (if not using proxy.txt)
- Test interval (in minutes)

The bot will automatically:
- Generate random test locations
- Validate your token
- Create a proxy agent if configured
- Schedule periodic tests

## 📝 Usage

Start the bot:
```bash
npm start
```

The bot will:
1. Initialize configuration
2. Perform speed tests at specified intervals
3. Report results to DeSpeed platform
4. Display detailed logs of operations

## 🛠️ Error Handling

The bot includes comprehensive error handling for:
- Network failures
- Invalid tokens
- Proxy issues
- API errors
- Connection timeouts

## 🔄 Automatic Features

- Token validation and expiry checking
- Random location generation within bounds
- Proxy connection testing
- Periodic speed testing
- Detailed logging

## ⚠️ Disclaimer

This tool is for educational purposes only. Make sure to comply with DeSpeed's terms of service and use responsibly.

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
