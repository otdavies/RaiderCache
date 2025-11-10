# Arc Raiders Loot List

Interactive loot decision tool for Arc Raiders - quickly determine what to keep, recycle, or sell.

![Arc Raiders Logo](https://img.shields.io/badge/Arc%20Raiders-Loot%20Tool-00bcd4?style=for-the-badge)
![Build Status](https://img.shields.io/github/actions/workflow/status/otdavies/RaiderCache/deploy.yml?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

## 🚀 Quick Start

Visit the live app: [https://otdavies.github.io/RaiderCache/](https://otdavies.github.io/RaiderCache/)

### Local Development

```bash
# Install dependencies
npm install

# Fetch game data
npm run fetch-data

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📊 Data Sources

This tool uses community-maintained data from:
- [RaidTheory/arcraiders-data](https://github.com/RaidTheory/arcraiders-data) - Primary data source
- Icons and item data are auto-updated daily via GitHub Actions

## 🛠️ Tech Stack

- **TypeScript** - Type safety and better maintainability
- **Vite** - Fast build tool and dev server
- **Fuse.js** - Fuzzy search functionality
- **Custom CSS** - Tailored to Arc Raiders aesthetic
- **GitHub Pages** - Free hosting
- **GitHub Actions** - Automated data updates

## 📖 How It Works

### Decisions

The app analyzes each item based on:

1. **Quest Requirements** - Items needed for active quests (KEEP)
2. **Project Requirements** - Items needed for projects (KEEP)
3. **Hideout Upgrades** - Materials for workshop upgrades (KEEP)
4. **Crafting Value** - Items used in valuable recipes (SITUATIONAL)
5. **Market Value** - High-value trinkets (SELL)
6. **Recycle Value** - Items that recycle into useful materials (RECYCLE)

### Automated Updates

- Data automatically syncs daily at 6 AM UTC
- GitHub Actions workflow fetches latest data from RaidTheory
- Validates data integrity before deployment
- Automatically rebuilds and redeploys the app

## 🎯 Usage Tips

1. **Set Your Hideout Levels** - Update the workshop tracker to get personalized recommendations
2. **Use Filters** - Click decision badges to filter by Keep/Recycle/Sell
3. **Search Quickly** - Type any item name for instant results
4. **Click Items** - View detailed information, recipes, and locations
5. **Bookmark Favorites** - Star items you want to track

## 🤝 Contributing

Contributions are welcome! If you find bugs or have suggestions:

1. Open an issue on GitHub
2. Submit a pull request
3. Report data inconsistencies

## 📝 License

MIT License - See [LICENSE](LICENSE) for details

## ⚠️ Disclaimer

This is a community-created tool and is not affiliated with Embark Studios.
All Arc Raiders game content © Embark Studios AB.

## 🙏 Credits

### Data & Icons
- **Primary Data Source**: [RaidTheory/arcraiders-data](https://github.com/RaidTheory/arcraiders-data)
  - Comprehensive item, quest, hideout, and project data
  - AI-upscaled item icons from in-game screenshots
  - Community-maintained with regular updates

### Additional Resources
- **Game Content**: All Arc Raiders game content © [Embark Studios AB](https://www.embark-studios.com/)
- **Official Game**: [Arc Raiders](https://arcraiders.com)
- **Community APIs**: [MetaForge](https://metaforge.app/arc-raiders) for supplementary data

### Special Thanks
- RaidTheory team for maintaining the open-source data repository
- Arc Raiders community for ongoing support and contributions
- Embark Studios for creating Arc Raiders

---

Made with ⚡ for the Arc Raiders community
