const { Plugin, PluginSettingTab, Setting } = require('obsidian');

const DEFAULT_SETTINGS = {
  switchKey: 'Alt',
  useComboKeys: false,
  strictSingleKeyMode: false,
  comboKeys: {
    cmd: true,
    ctrl: true,
    alt: true,
    shift: true
  }
};

class TabSwitchPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    
    console.log('Tab Switch Debug - Plugin loaded with settings:', this.settings);
    
    this.tabSwitcher = new TabSwitcher(this.app, this.settings);
    
    this.addSettingTab(new TabSwitchSettingTab(this.app, this));
    
    this.registerDomEvent(document, 'keydown', this.tabSwitcher.handleKeyDown.bind(this.tabSwitcher));
    this.registerDomEvent(document, 'keyup', this.tabSwitcher.handleKeyUp.bind(this.tabSwitcher));
    
    console.log('Tab Switch Debug - Event listeners registered');
    
    // 添加一个测试事件监听器
    this.registerDomEvent(document, 'keydown', (event) => {
      if (event.key === this.settings.switchKey) {
        console.log('Tab Switch Debug - Test event listener caught switchKey:', event.key);
      }
      // 特别监听Control键
      if (event.key === 'Control') {
        console.log('Tab Switch Debug - Test listener caught Control key!', {
          ctrlKey: event.ctrlKey,
          defaultPrevented: event.defaultPrevented,
          bubbles: event.bubbles,
          cancelable: event.cancelable
        });
      }
    });
  }
  
  onunload() {
    if (this.tabSwitcher) {
      this.tabSwitcher.destroy();
    }
  }
  
  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class TabSwitcher {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.tabItems = [];
    this.currentIndex = 0;
    this.isVisible = false;
    this.keyPressed = false;
    this.comboKeysPressed = {
      cmd: false,
      ctrl: false,
      alt: false,
      shift: false
    };
    this.comboKeysActive = false; // 组合键是否激活状态
    this.createTabBar();
    
    // 添加一个备用的全局监听器，以防主要监听器被拦截
    this.backupKeyListener = (event) => {
      if (event.key === 'Control') {
        console.log('Tab Switch Debug - Backup listener caught Control!');
      }
    };
    window.addEventListener('keydown', this.backupKeyListener, true); // 使用capture模式
  }
  
  createTabBar() {
    this.tabBar = document.createElement('div');
    this.tabBar.className = 'tab-switch-bar';
    this.tabBar.style.display = 'none';
    
    // 强制设置关键样式，确保可见性
    this.tabBar.style.position = 'fixed';
    this.tabBar.style.top = '50%';
    this.tabBar.style.left = '50%';
    this.tabBar.style.transform = 'translate(-50%, -50%)';
    this.tabBar.style.zIndex = '1000';
    this.tabBar.style.background = 'var(--background-primary)';
    this.tabBar.style.border = '1px solid var(--background-modifier-border)';
    this.tabBar.style.borderRadius = '12px';
    this.tabBar.style.padding = '20px';
    this.tabBar.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
    
    document.body.appendChild(this.tabBar);
    
    // console.log('Tab Switch Debug - tabBar created and appended to body');
    
    // 添加滚动监听器来实时更新边缘阴影
    this.tabBar.addEventListener('scroll', () => {
      this.updateScrollIndicators();
    });
  }
  
  getTabs() {
    console.log('Tab Switch Debug - getTabs called');
    
    // 先尝试原始的检测方法（已知有效）
    let leaves = this.app.workspace.getLeavesOfType('markdown')
      .concat(this.app.workspace.getLeavesOfType('pdf'))
      .concat(this.app.workspace.getLeavesOfType('image'))
      .concat(this.app.workspace.getLeavesOfType('video'))
      .concat(this.app.workspace.getLeavesOfType('audio'))
      .concat(this.app.workspace.getLeavesOfType('canvas'))
      .concat(this.app.workspace.getLeavesOfType('excalidraw'));
    
    // 尝试获取可能的web viewer类型 - 扩展列表
    const webViewTypes = [
      'web-view', 'webview', 'browser-view', 'custom-frames', 'iframe', 'web-browser',
      'surfing-view', 'browser', 'webpage', 'site', 'external-link', 'url-view',
      'web', 'http', 'https'
    ];
    
    let webViewLeaves = [];
    webViewTypes.forEach(type => {
      try {
        const typeLeaves = this.app.workspace.getLeavesOfType(type);
        if (typeLeaves.length > 0) {
          console.log(`Tab Switch Debug - Found ${typeLeaves.length} leaves of type "${type}"`);
          webViewLeaves = webViewLeaves.concat(typeLeaves);
        }
      } catch (e) {
        // 类型不存在，继续
      }
    });
    
    leaves = leaves.concat(webViewLeaves);
    console.log('Tab Switch Debug - Added web viewer leaves:', webViewLeaves.length);
    
    // 始终使用iterateLeaves来补充，确保不遗漏任何tab（包括web viewer）
    console.log('Tab Switch Debug - Supplementing with iterateLeaves to catch all tabs');
    console.log('Tab Switch Debug - Current leaves before iterateLeaves:', leaves.length);
    
    const initialLeafCount = leaves.length;
    const allLeaves = [];
    
    // 尝试不同的iterate方法
    console.log('Tab Switch Debug - Trying iterateLeaves...');
    this.app.workspace.iterateLeaves((leaf) => {
      if (leaf && leaf.view) {
        allLeaves.push(leaf);
      }
    });
    
    console.log('Tab Switch Debug - iterateLeaves result:', allLeaves.length);
    
    // 如果iterateLeaves失败，尝试其他方法
    if (allLeaves.length === 0) {
      console.log('Tab Switch Debug - iterateLeaves failed, trying alternative methods...');
      
      // 尝试iterateAllLeaves
      if (this.app.workspace.iterateAllLeaves) {
        console.log('Tab Switch Debug - Trying iterateAllLeaves...');
        this.app.workspace.iterateAllLeaves((leaf) => {
          if (leaf && leaf.view) {
            allLeaves.push(leaf);
          }
        });
      }
    }
    
    console.log('Tab Switch Debug - iterateLeaves found:', allLeaves.length, 'total leaves');
    
    // 详细分析workspace结构
    console.log('Tab Switch Debug - Workspace analysis:');
    console.log('  - Root split children:', this.app.workspace.rootSplit?.children?.length || 0);
    console.log('  - Left split children:', this.app.workspace.leftSplit?.children?.length || 0);
    console.log('  - Right split children:', this.app.workspace.rightSplit?.children?.length || 0);
    
    // 检查是否有其他可能的容器
    const workspace = this.app.workspace;
    if (workspace.floatingSplit) {
      console.log('  - Floating split children:', workspace.floatingSplit.children?.length || 0);
    }
    
    // 尝试通过不同方式获取所有tab
    const allTabHeaders = document.querySelectorAll('.workspace-tab-header');
    console.log('Tab Switch Debug - Found', allTabHeaders.length, 'tab headers in DOM');
    
    allTabHeaders.forEach((header, index) => {
      const titleEl = header.querySelector('.workspace-tab-header-inner-title');
      const title = titleEl?.textContent || 'Unknown';
      console.log(`  DOM Tab ${index}:`, title, 'classes:', header.className);
      
      // 尝试从DOM元素反向找到对应的leaf
      try {
        // 尝试多种方式找到leaf
        let domLeaf = null;
        
        // 方式1：从tab-container找
        const tabContainer = header.closest('.workspace-tab-container');
        if (tabContainer && tabContainer.leaf) {
          domLeaf = tabContainer.leaf;
          console.log(`    - Found leaf via tab-container:`, domLeaf.id);
        }
        
        // 方式2：从workspace-leaf找
        if (!domLeaf) {
          const workspaceLeaf = header.closest('.workspace-leaf');
          if (workspaceLeaf && workspaceLeaf.leaf) {
            domLeaf = workspaceLeaf.leaf;
            console.log(`    - Found leaf via workspace-leaf:`, domLeaf.id);
          }
        }
        
        // 方式3：检查header本身的属性
        if (!domLeaf) {
          if (header.leaf) {
            domLeaf = header.leaf;
            console.log(`    - Found leaf via header:`, domLeaf.id);
          }
        }
        
        // 方式4：通过workspace查找匹配标题的leaf
        if (!domLeaf) {
          const allWorkspaceLeaves = [];
          this.app.workspace.iterateAllLeaves ? 
            this.app.workspace.iterateAllLeaves(leaf => allWorkspaceLeaves.push(leaf)) :
            this.app.workspace.iterateLeaves(leaf => allWorkspaceLeaves.push(leaf));
          
          domLeaf = allWorkspaceLeaves.find(leaf => {
            const leafTitle = leaf.view?.getDisplayText?.() || leaf.getDisplayText?.() || '';
            return leafTitle === title;
          });
          
          if (domLeaf) {
            console.log(`    - Found leaf via title match:`, domLeaf.id);
          }
        }
        
        if (domLeaf) {
          console.log(`    - Leaf details:`, 'id:', domLeaf.id, 'viewType:', domLeaf.getViewType?.(), 'in leaves array:', leaves.includes(domLeaf));
          
          // 如果这个leaf不在我们的列表中，添加它
          if (!leaves.includes(domLeaf) && domLeaf.view) {
            leaves.push(domLeaf);
            console.log(`    - Added missing leaf from DOM:`, domLeaf.id, 'title:', title);
          }
        } else {
          console.log(`    - No leaf found for DOM tab:`, title);
        }
      } catch (e) {
        console.log(`    - Error finding leaf for DOM tab:`, title, e.message);
      }
    });
    
    // 合并，但避免重复
    allLeaves.forEach(leaf => {
      if (!leaves.includes(leaf)) {
        leaves.push(leaf);
        console.log('Tab Switch Debug - Added additional leaf:', leaf.id, 'viewType:', leaf.getViewType?.(), 'title:', leaf.view?.getDisplayText?.() || leaf.getDisplayText?.());
      }
    });
    console.log('Tab Switch Debug - Added additional leaves:', leaves.length - initialLeafCount);
    
    console.log('Tab Switch Debug - Total leaves found:', leaves.length);
    
    // 获取当前活跃的叶子节点
    const activeLeaf = this.app.workspace.activeLeaf;
    
    // 获取最近访问的文件列表
    let recentFiles = [];
    try {
      if (this.app.workspace.getLastOpenFiles) {
        recentFiles = this.app.workspace.getLastOpenFiles();
      }
    } catch (e) {
      recentFiles = [];
    }
    
    // 添加详细调试来理解叶子节点的结构，特别关注web viewer
    console.log('Tab Switch Debug - Analyzing leaves structure:');
    console.log('Tab Switch Debug - Current activeLeaf:', activeLeaf?.id, 'viewType:', activeLeaf?.getViewType?.(), 'title:', activeLeaf?.view?.getDisplayText?.() || activeLeaf?.getDisplayText?.());
    
    leaves.forEach((leaf, index) => {
      const viewType = leaf.getViewType?.();
      const hasUrl = !!(leaf.view && (leaf.view.url || leaf.view.src));
      const viewTypeLower = viewType?.toLowerCase() || '';
      const isWebViewer = hasUrl || viewTypeLower.includes('web') || viewTypeLower.includes('frame') || viewTypeLower.includes('browser');
      
      console.log(`Leaf ${index}:`, 'viewType:', viewType, 'hasView:', !!leaf.view, 'hasFile:', !!(leaf.view && leaf.view.file), 'title:', leaf.view?.getDisplayText?.() || leaf.getDisplayText?.(), 'isActive:', leaf === activeLeaf, 'hasUrl:', hasUrl, 'url:', leaf.view?.url || leaf.view?.src, 'isWebViewer:', isWebViewer, 'leafId:', leaf.id, 'viewConstructor:', leaf.view?.constructor?.name);
      
      // 特别检查所有属性来找到web viewer
      if (leaf.view) {
        const allProps = Object.keys(leaf.view);
        const webRelatedProps = allProps.filter(k => 
          k.toLowerCase().includes('url') || 
          k.toLowerCase().includes('src') || 
          k.toLowerCase().includes('frame') || 
          k.toLowerCase().includes('web') ||
          k.toLowerCase().includes('browser') ||
          k.toLowerCase().includes('iframe')
        );
        console.log(`  View props (${allProps.length} total):`, allProps.slice(0, 15));
        if (webRelatedProps.length > 0) {
          console.log(`  Web-related props:`, webRelatedProps);
        }
        
        // 特别检查可能的web viewer标识
        if (leaf.view.containerEl) {
          const container = leaf.view.containerEl;
          console.log(`  Container classes:`, container.className || 'none');
          
          // 检查是否包含iframe
          const iframes = container.querySelectorAll('iframe');
          if (iframes.length > 0) {
            console.log(`  Found ${iframes.length} iframes:`, Array.from(iframes).map(f => f.src).slice(0, 3));
          }
        }
      }
    });
    
    // 处理所有标签页，然后按类型过滤
    const allTabs = leaves
      .filter(leaf => leaf !== activeLeaf) // 只排除当前所在页面
      .map(leaf => this.getTabInfo(leaf))
      .filter(tab => tab !== null) // 过滤掉无效的标签页
      .filter(tab => {
        // 严格过滤：只保留markdown文件类型和web viewer类型
        const isMarkdownFile = tab.type === 'file'; // 只允许有文件的markdown类型
        const isWebViewer = tab.type === 'web';
        
        console.log('Tab Switch Debug - Filtering tab:', tab.title, 'type:', tab.type, 'isMarkdownFile:', isMarkdownFile, 'isWebViewer:', isWebViewer);
        
        return isMarkdownFile || isWebViewer;
      });
    
    console.log('Tab Switch Debug - All tabs processed:', allTabs.length);
    console.log('Tab Switch Debug - After type filtering (markdown + webviewer):', allTabs.length);
    
    // 真正的去重逻辑：基于leafId和标题进行去重
    console.log('Tab Switch Debug - Starting deduplication, input tabs:', allTabs.length);
    const uniqueTabs = [];
    const seenLeaves = new Set();
    const seenTitles = new Map(); // 记录已见过的标题及其对应的tab
    
    allTabs.forEach((tab, index) => {
      console.log(`Tab Switch Debug - Processing tab ${index}:`, 'title:', tab.title, 'path:', tab.path, 'type:', tab.type, 'leafId:', tab.leaf?.id);
      
      // 跳过重复的leaf对象
      if (seenLeaves.has(tab.leaf)) {
        console.log('Tab Switch Debug - Skipping duplicate leaf:', tab.title);
        return;
      }
      seenLeaves.add(tab.leaf);
      
      // 检查是否有相同标题的tab
      if (seenTitles.has(tab.title)) {
        const existingTab = seenTitles.get(tab.title);
        console.log('Tab Switch Debug - Found duplicate title:', tab.title);
        
        // 优先保留markdown文件类型，其次保留web类型
        if (tab.type === 'file' && existingTab.type !== 'file') {
          // 当前tab是文件类型，现有的不是，替换现有的
          const existingIndex = uniqueTabs.indexOf(existingTab);
          if (existingIndex !== -1) {
            uniqueTabs[existingIndex] = tab;
            seenTitles.set(tab.title, tab);
            console.log('Tab Switch Debug - Replaced with markdown file type:', tab.title);
          }
        } else if (tab.type === 'web' && existingTab.type !== 'file' && existingTab.type !== 'web') {
          // 当前tab是web类型，现有的不是文件也不是web，替换现有的
          const existingIndex = uniqueTabs.indexOf(existingTab);
          if (existingIndex !== -1) {
            uniqueTabs[existingIndex] = tab;
            seenTitles.set(tab.title, tab);
            console.log('Tab Switch Debug - Replaced with web type:', tab.title);
          }
        } else {
          console.log('Tab Switch Debug - Keeping existing tab, skipping duplicate:', tab.title);
        }
      } else {
        // 没有重复标题，直接添加
        uniqueTabs.push(tab);
        seenTitles.set(tab.title, tab);
        console.log('Tab Switch Debug - Added unique tab:', tab.title);
      }
    });
    
    console.log('Tab Switch Debug - Deduplication complete, unique tabs:', uniqueTabs.length);
    
    // 按上一次访问顺序排序
    uniqueTabs.sort((a, b) => {
      const aRecentIndex = recentFiles.indexOf(a.path);
      const bRecentIndex = recentFiles.indexOf(b.path);
      
      // 如果都在最近文件列表中，按列表顺序排序（最近访问的在前）
      if (aRecentIndex !== -1 && bRecentIndex !== -1) {
        return aRecentIndex - bRecentIndex;
      }
      
      // 如果只有一个在最近文件列表中，优先显示
      if (aRecentIndex !== -1 && bRecentIndex === -1) return -1;
      if (aRecentIndex === -1 && bRecentIndex !== -1) return 1;
      
      // 都不在最近文件列表中，按文件修改时间排序
      if (a.type === 'file' && b.type === 'file') {
        const aTime = a.file?.stat?.mtime || 0;
        const bTime = b.file?.stat?.mtime || 0;
        return bTime - aTime;
      } else {
        // 对于web页面或其他类型，按标题字母顺序排序
        return a.title.localeCompare(b.title);
      }
    });
    
    console.log('Tab Switch Debug - Final unique tabs:', uniqueTabs.length);
    
    return uniqueTabs;
  }
  
  getViewTypeForTab(leaf) {
    // 辅助方法，用于获取tab的视图类型以便区分
    let viewType = 'unknown';
    
    if (leaf && leaf.getViewType && typeof leaf.getViewType === 'function') {
      try {
        viewType = leaf.getViewType();
      } catch (e) {
        // ignore
      }
    }
    
    if (!viewType || viewType === 'unknown') {
      if (leaf && leaf.view && leaf.view.getViewType && typeof leaf.view.getViewType === 'function') {
        try {
          viewType = leaf.view.getViewType();
        } catch (e) {
          // ignore
        }
      }
    }
    
    if (!viewType || viewType === 'unknown') {
      if (leaf && leaf.view && leaf.view.viewType) {
        viewType = leaf.view.viewType;
      }
    }
    
    // 如果还是unknown，使用leafId的一部分作为区分
    if (!viewType || viewType === 'unknown') {
      viewType = leaf?.id?.slice(-4) || 'view';
    }
    
    return viewType;
  }
  
  getTabInfo(leaf) {
    try {
      // 修复获取视图类型的逻辑
      let viewType = 'unknown';
      
      // 尝试多种方式获取viewType
      if (leaf.getViewType && typeof leaf.getViewType === 'function') {
        try {
          viewType = leaf.getViewType();
        } catch (e) {
          console.log('Tab Switch Debug - leaf.getViewType() failed:', e);
        }
      }
      
      // 如果还是undefined，尝试从view获取
      if (!viewType || viewType === 'unknown') {
        if (leaf.view && leaf.view.getViewType && typeof leaf.view.getViewType === 'function') {
          try {
            viewType = leaf.view.getViewType();
          } catch (e) {
            console.log('Tab Switch Debug - leaf.view.getViewType() failed:', e);
          }
        }
      }
      
      // 如果还是undefined，尝试从view.viewType属性获取
      if (!viewType || viewType === 'unknown') {
        if (leaf.view && leaf.view.viewType) {
          viewType = leaf.view.viewType;
        }
      }
      
      // 最后的fallback，基于view的属性判断
      if (!viewType || viewType === 'unknown') {
        if (leaf.view && leaf.view.file) {
          viewType = 'markdown'; // 有文件的通常是markdown
        } else if (leaf.view && leaf.view.navigation) {
          // 检查是否有navigation属性，可能是特殊视图
          viewType = 'special';
        }
      }
      
      console.log('Tab Switch Debug - Processing leaf:', 'viewType:', viewType, 'hasView:', !!leaf.view, 'hasFile:', !!(leaf.view && leaf.view.file), 'viewConstructor:', leaf.view?.constructor?.name, 'leafId:', leaf.id);
      
      // 尝试通过其他方式获取文件信息
      let file = null;
      let title = 'Unknown';
      let path = 'unknown';
      
      // 检查是否为文件标签页
      if (leaf.view && leaf.view.file) {
        file = leaf.view.file;
        title = file.basename || 'Untitled';
        path = file.path;
        console.log('Tab Switch Debug - Found file tab:', title);
        return {
          leaf,
          file: file,
          title: title,
          path: path,
          type: 'file'
        };
      }
      
      // 检查是否为markdown视图但没有直接的file属性
      if (viewType === 'markdown' || (leaf.view && leaf.view.constructor.name === 'MarkdownView')) {
        // 尝试从视图数据中获取文件信息
        try {
          if (leaf.view.data && leaf.view.data.file) {
            file = leaf.view.data.file;
          } else if (leaf.view.editor && leaf.view.editor.file) {
            file = leaf.view.editor.file;
          } else if (leaf.view.app && leaf.view.app.workspace.activeLeaf === leaf) {
            // 对于当前活跃叶子，尝试从workspace获取
            const activeFile = leaf.view.app.workspace.getActiveFile();
            if (activeFile) {
              file = activeFile;
            }
          }
          
          if (file) {
            title = file.basename || 'Untitled';
            path = file.path;
            console.log('Tab Switch Debug - Found markdown file via alternate method:', title);
            return {
              leaf,
              file: file,
              title: title,
              path: path,
              type: 'file'
            };
          }
        } catch (e) {
          console.warn('Tab Switch Debug - Failed to get file from markdown view:', e);
        }
      }
      
      // 增强的Web viewer标签页检查
      if (leaf.view) {
        // 检查多种可能的web viewer属性
        let webUrl = null;
        let webTitle = null;
        let isWebViewer = false;
        
        // 常见的web viewer属性检查
        if (leaf.view.url) {
          webUrl = leaf.view.url;
          isWebViewer = true;
        } else if (leaf.view.src) {
          webUrl = leaf.view.src;
          isWebViewer = true;
        } else if (leaf.view.iframe && leaf.view.iframe.src) {
          webUrl = leaf.view.iframe.src;
          isWebViewer = true;
        } else if (leaf.view.frame && leaf.view.frame.src) {
          webUrl = leaf.view.frame.src;
          isWebViewer = true;
        } else if (leaf.view.webview && leaf.view.webview.src) {
          webUrl = leaf.view.webview.src;
          isWebViewer = true;
        }
        
        // 检查DOM中是否有iframe（许多web viewer插件使用这种方式）
        if (!isWebViewer && leaf.view.containerEl) {
          const iframes = leaf.view.containerEl.querySelectorAll('iframe');
          if (iframes.length > 0) {
            isWebViewer = true;
            webUrl = iframes[0].src || 'iframe://embedded';
            console.log('Tab Switch Debug - Found iframe-based web viewer:', webUrl);
          }
        }
        
        // 检查是否是已知的web viewer类型
        const webViewTypes = ['web-view', 'webview', 'browser-view', 'custom-frames', 'iframe', 'web-browser'];
        if (isWebViewer || webViewTypes.includes(viewType)) {
          // 尝试获取标题
          if (leaf.view.getDisplayText && typeof leaf.view.getDisplayText === 'function') {
            webTitle = leaf.view.getDisplayText();
          } else if (leaf.getDisplayText && typeof leaf.getDisplayText === 'function') {
            webTitle = leaf.getDisplayText();
          } else if (leaf.view.title) {
            webTitle = leaf.view.title;
          } else if (leaf.view.name) {
            webTitle = leaf.view.name;
          }
          
          // 如果还没有URL，尝试从视图类型推断
          if (!webUrl) {
            webUrl = `${viewType}://internal`;
          }
          
          title = webTitle || 'Web Page';
          path = webUrl;
          console.log('Tab Switch Debug - Found web tab:', title, 'URL:', path, 'ViewType:', viewType, 'isWebViewer:', isWebViewer);
          return {
            leaf,
            file: null,
            title: title,
            path: path,
            type: 'web'
          };
        }
      }
      
      // 其他类型的标签页（如画布、插件视图等）
      // 尝试获取标题
      if (leaf.view && typeof leaf.view.getDisplayText === 'function') {
        title = leaf.view.getDisplayText();
      } else if (typeof leaf.getDisplayText === 'function') {
        title = leaf.getDisplayText();
      } else if (viewType && viewType !== 'unknown') {
        title = viewType;
      }
      
      // 为了去重，需要创建唯一的路径标识符
      let uniqueId = '';
      if (leaf.view && leaf.view.id) {
        uniqueId = leaf.view.id;
      } else if (leaf.id) {
        uniqueId = leaf.id;
      } else {
        // 如果没有ID，使用标题和位置作为唯一标识
        uniqueId = title + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      }
      
      path = (viewType || 'unknown') + ':' + uniqueId;
      
      console.log('Tab Switch Debug - Found other tab:', title, 'type:', viewType, 'path:', path);
      
      return {
        leaf,
        file: null,
        title: title || 'Unknown',
        path: path,
        type: 'other'
      };
    } catch (e) {
      console.warn('Tab Switch Debug - Failed to get tab info for leaf:', e);
      return null;
    }
  }
  
  renderTabBar() {
    this.tabBar.innerHTML = '';
    this.tabItems = [];
    
    const tabs = this.getTabs();
    
    // 调试：打印tabs数量
    // console.log('Tab Switch Debug - tabs count:', tabs.length);
    
    if (tabs.length === 0) {
      // 如果没有tab，显示提示信息
      const noTabsItem = document.createElement('div');
      noTabsItem.className = 'tab-switch-item';
      noTabsItem.innerHTML = '<div class="tab-switch-title">没有可切换的标签页</div>';
      this.tabBar.appendChild(noTabsItem);
      return;
    }
    
    tabs.forEach((tab, index) => {
      const tabItem = document.createElement('div');
      tabItem.className = 'tab-switch-item';
      if (index === this.currentIndex) {
        tabItem.classList.add('active');
      }
      
      const tabTitle = document.createElement('div');
      tabTitle.className = 'tab-switch-title';
      tabTitle.textContent = tab.title;
      
      const tabPath = document.createElement('div');
      tabPath.className = 'tab-switch-path';
      
      // 根据标签页类型显示不同的路径信息
      if (tab.type === 'web') {
        // 对于web页面，显示URL（可能需要截断长URL）
        const url = tab.path;
        tabPath.textContent = url.length > 60 ? url.substring(0, 57) + '...' : url;
        tabPath.title = url; // 完整URL显示在tooltip中
      } else if (tab.type === 'file') {
        // 对于文件，显示文件路径
        tabPath.textContent = tab.file ? tab.file.path : tab.path;
      } else {
        // 对于其他类型，安全地获取视图类型
        let viewType = 'unknown';
        try {
          if (tab.leaf && typeof tab.leaf.getViewType === 'function') {
            viewType = tab.leaf.getViewType();
          } else if (tab.path && tab.path.includes(':')) {
            viewType = tab.path.split(':')[0];
          }
        } catch (e) {
          console.warn('Tab Switch Debug - Failed to get view type for tab:', tab);
        }
        tabPath.textContent = `[${viewType}]`;
      }
      
      tabItem.appendChild(tabTitle);
      tabItem.appendChild(tabPath);
      
      this.tabBar.appendChild(tabItem);
      this.tabItems.push(tabItem);
    });
  }
  
  showTabBar() {
    if (this.isVisible) return;
    
    console.log('Tab Switch Debug - showTabBar called');
    
    this.isVisible = true;
    // 新逻辑：默认选择第一个tab（索引0）
    this.currentIndex = 0;
    this.originalIndex = 0; // 记录原始位置，用于左键恢复
    this.renderTabBar();
    this.tabBar.style.display = 'flex';
    
    console.log('Tab Switch Debug - tabBar display set to flex');
    console.log('Tab Switch Debug - tabBar style:', this.tabBar.style.cssText);
    console.log('Tab Switch Debug - tabBar in DOM:', document.body.contains(this.tabBar));
    
    // 确保初始状态下选中项可见
    setTimeout(() => {
      this.scrollToActiveTab();
      this.updateScrollIndicators();
    }, 100); // 增加等待时间，确保DOM完全渲染和样式应用
  }
  
  hideTabBar() {
    if (!this.isVisible) return;
    
    this.isVisible = false;
    this.tabBar.style.display = 'none';
    
    // 重置状态
    this.comboKeysActive = false;
  }
  
  moveSelection(direction) {
    if (!this.isVisible) return;
    
    const tabs = this.getTabs();
    if (tabs.length === 0) return;
    
    this.tabItems[this.currentIndex]?.classList.remove('active');
    
    if (direction === 'left') {
      this.currentIndex = (this.currentIndex - 1 + tabs.length) % tabs.length;
    } else {
      this.currentIndex = (this.currentIndex + 1) % tabs.length;
    }
    
    this.tabItems[this.currentIndex]?.classList.add('active');
    
    // 确保选中的标签页在可视区域内
    this.scrollToActiveTab();
    
    // 立即更新滚动指示器
    this.updateScrollIndicators();
  }
  
  returnToCurrentTabPosition() {
    if (!this.isVisible) return;
    
    const tabs = this.getTabs();
    const activeLeaf = this.app.workspace.activeLeaf;
    
    // 找到当前活跃tab在过滤后列表中的位置
    let currentTabIndex = -1;
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].leaf === activeLeaf) {
        currentTabIndex = i;
        break;
      }
    }
    
    if (currentTabIndex !== -1) {
      // 找到了当前tab在列表中的位置
      this.tabItems[this.currentIndex]?.classList.remove('active');
      this.currentIndex = currentTabIndex;
      this.tabItems[this.currentIndex]?.classList.add('active');
      
      // 确保选中的标签页在可视区域内
      this.scrollToActiveTab();
      this.updateScrollIndicators();
      
      console.log('Tab Switch Debug - Returned to current tab position:', currentTabIndex);
    } else {
      // 当前tab不在过滤后的列表中，保持在第一个位置
      console.log('Tab Switch Debug - Current tab not in filtered list, staying at first position');
    }
  }
  
  switchToSelectedTab() {
    if (!this.isVisible) return;
    
    const tabs = this.getTabs();
    const selectedTab = tabs[this.currentIndex];
    
    if (selectedTab) {
      this.app.workspace.setActiveLeaf(selectedTab.leaf);
      
      // 确保编辑器获得焦点
      setTimeout(() => {
        const view = selectedTab.leaf.view;
        // 优先尝试编辑器焦点（用于 Markdown 视图）
        if (view.editor && typeof view.editor.focus === 'function') {
          view.editor.focus();
        } else if (typeof view.focus === 'function') {
          // 对于其他视图类型的回退（如 Canvas、PDF 等）
          view.focus();
        }
      }, 50);
    }
    
    this.hideTabBar();
  }
  
  handleKeyDown(event) {
    console.log('Tab Switch Debug - handleKeyDown called with key:', event.key);
    
    // 特别调试Control键
    if (event.key === 'Control') {
      console.log('Tab Switch Debug - Control key detected!', {
        key: event.key,
        switchKey: this.settings.switchKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        strictMode: this.settings.strictSingleKeyMode
      });
    }
    
    // 更新组合键状态
    this.updateComboKeyState(event, true);
    
    console.log('Tab Switch Debug - key pressed:', event.key, 'useComboKeys:', this.settings.useComboKeys, 'switchKey:', this.settings.switchKey);
    
    // 检查是否使用组合键模式
    if (this.settings.useComboKeys) {
      // 检查是否所有需要的组合键都按下了
      if (this.isComboKeysPressed()) {
        // console.log('Tab Switch Debug - combo keys pressed, comboKeysActive:', this.comboKeysActive);
        // 如果组合键刚刚激活，显示tab栏
        if (!this.comboKeysActive) {
          this.comboKeysActive = true;
          this.showTabBar();
          event.preventDefault();
          return;
        }
        
        // 组合键已激活，处理方向键
        if (event.key === 'ArrowLeft') {
          this.moveSelection('left');
          event.preventDefault();
          return;
        } else if (event.key === 'ArrowRight') {
          this.moveSelection('right');
          event.preventDefault();
          return;
        }
      }
    } else {
      // 原有的单键模式
      console.log('Tab Switch Debug - Single key mode, checking:', {
        eventKey: event.key,
        switchKey: this.settings.switchKey,
        keyMatches: event.key === this.settings.switchKey,
        singleKeyPressed: this.isOnlySingleKeyPressed(event)
      });
      
      if (event.key === this.settings.switchKey && this.isOnlySingleKeyPressed(event)) {
        console.log('Tab Switch Debug - switchKey matched, keyPressed:', this.keyPressed);
        if (!this.keyPressed) {
          this.keyPressed = true;
          this.showTabBar();
        }
        event.preventDefault();
        return;
      }
      
      if (this.isVisible && this.keyPressed) {
        if (event.key === 'ArrowLeft') {
          // 特殊逻辑：如果当前在第一个tab，回到当前tab位置；否则正常向左移动
          if (this.currentIndex === 0) {
            this.returnToCurrentTabPosition();
          } else {
            this.moveSelection('left');
          }
          event.preventDefault();
        } else if (event.key === 'ArrowRight') {
          this.moveSelection('right');
          event.preventDefault();
        }
      }
    }
  }
  
  handleKeyUp(event) {
    // 更新组合键状态
    this.updateComboKeyState(event, false);
    
    if (this.settings.useComboKeys) {
      // 组合键模式：检查是否所有组合键都已释放
      if (this.comboKeysActive && !this.isComboKeysPressed()) {
        // console.log('Tab Switch Debug - combo keys released, switching to selected tab');
        this.comboKeysActive = false;
        this.switchToSelectedTab();
      }
    } else {
      // 单键模式 - 恢复原逻辑：松开control自动跳转
      if (event.key === this.settings.switchKey) {
        this.keyPressed = false;
        this.switchToSelectedTab();
      }
    }
  }
  
  updateComboKeyState(event, isPressed) {
    // 更新组合键状态
    if (event.key === 'Meta' || event.metaKey !== undefined) {
      this.comboKeysPressed.cmd = isPressed ? event.metaKey : false;
    }
    if (event.key === 'Control' || event.ctrlKey !== undefined) {
      this.comboKeysPressed.ctrl = isPressed ? event.ctrlKey : false;
    }
    if (event.key === 'Alt' || event.altKey !== undefined) {
      this.comboKeysPressed.alt = isPressed ? event.altKey : false;
    }
    if (event.key === 'Shift' || event.shiftKey !== undefined) {
      this.comboKeysPressed.shift = isPressed ? event.shiftKey : false;
    }
  }
  
  isComboKeysPressed() {
    const required = this.settings.comboKeys;
    return (!required.cmd || this.comboKeysPressed.cmd) &&
           (!required.ctrl || this.comboKeysPressed.ctrl) &&
           (!required.alt || this.comboKeysPressed.alt) &&
           (!required.shift || this.comboKeysPressed.shift) &&
           (required.cmd || required.ctrl || required.alt || required.shift); // 至少需要一个修饰键
  }
  
  isOnlySingleKeyPressed(event) {
    const result = !this.settings.strictSingleKeyMode || this.checkStrictSingleKey(event);
    console.log('Tab Switch Debug - isOnlySingleKeyPressed:', result, 'strictMode:', this.settings.strictSingleKeyMode);
    return result;
  }
  
  checkStrictSingleKey(event) {
    const targetKey = this.settings.switchKey;
    
    // 检查是否只按下了目标键，没有其他修饰键
    if (targetKey === 'Alt') {
      return event.key === 'Alt' && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    } else if (targetKey === 'Control') {
      return event.key === 'Control' && !event.altKey && !event.metaKey && !event.shiftKey;
    } else if (targetKey === 'Meta') {
      return event.key === 'Meta' && !event.altKey && !event.ctrlKey && !event.shiftKey;
    }
    
    return false;
  }
  
  switchToPreviousTab() {
    const tabs = this.getTabs();
    if (tabs.length === 0) return;
    
    const currentLeaf = this.app.workspace.activeLeaf;
    const currentIndex = tabs.findIndex(tab => tab.leaf === currentLeaf);
    
    const previousIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
    this.app.workspace.setActiveLeaf(tabs[previousIndex].leaf);
  }
  
  switchToNextTab() {
    const tabs = this.getTabs();
    if (tabs.length === 0) return;
    
    const currentLeaf = this.app.workspace.activeLeaf;
    const currentIndex = tabs.findIndex(tab => tab.leaf === currentLeaf);
    
    const nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
    this.app.workspace.setActiveLeaf(tabs[nextIndex].leaf);
  }
  
  scrollToActiveTab() {
    if (!this.isVisible || this.tabItems.length === 0) return;
    
    const activeTab = this.tabItems[this.currentIndex];
    if (!activeTab) return;
    
    const container = this.tabBar;
    
    // 计算每个tab项的宽度（包括gap）
    const tabWidth = activeTab.offsetWidth;
    const gap = 16; // CSS中定义的gap值
    const itemTotalWidth = tabWidth + gap;
    
    // 计算容器的可视宽度（减去padding）
    const containerPadding = 40; // 左右padding总和 (20px * 2)
    const visibleWidth = container.clientWidth - containerPadding;
    
    // 计算一屏能显示多少个完整的tab项
    const itemsPerView = Math.floor(visibleWidth / itemTotalWidth);
    
    // 如果tab项总数少于一屏能显示的数量，不需要滚动
    if (this.tabItems.length <= itemsPerView) {
      container.scrollLeft = 0;
      this.updateScrollIndicators();
      return;
    }
    
    // 计算目标滚动位置
    let targetScrollLeft;
    
    if (this.currentIndex < 1) {
      // 如果是前两个，滚动到开头
      targetScrollLeft = 0;
    } else if (this.currentIndex >= this.tabItems.length - 1) {
      // 如果是最后一个，精确计算滚动位置以确保最后一个tab完全可见
      const lastTab = this.tabItems[this.tabItems.length - 1];
      const lastTabWidth = lastTab.offsetWidth;
      const lastTabLeft = lastTab.offsetLeft;
      
      // 计算理想的滚动位置：让最后一个tab的右边缘与容器右边缘对齐（考虑padding）
      targetScrollLeft = Math.max(0, 
        lastTabLeft + lastTabWidth + 20 - container.clientWidth
      );
      
      // 确保不超过最大滚动距离
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      targetScrollLeft = Math.min(targetScrollLeft, maxScrollLeft);
    } else {
      // 中间位置：让当前选中项保持在倒数第二个位置
      const itemsBeforeCurrent = Math.min(itemsPerView - 2, this.currentIndex);
      const targetIndex = this.currentIndex - itemsBeforeCurrent;
      targetScrollLeft = Math.max(0, targetIndex * itemTotalWidth);
    }
    
    // 平滑滚动到目标位置
    container.scrollTo({
      left: targetScrollLeft,
      behavior: 'smooth'
    });
    
    // 更新滚动指示器 - 多个时间点更新确保准确性
    this.updateScrollIndicators();
    setTimeout(() => {
      this.updateScrollIndicators();
    }, 150);
    setTimeout(() => {
      this.updateScrollIndicators();
    }, 350);
  }
  
  updateScrollIndicators() {
    if (!this.tabBar) return;
    
    const container = this.tabBar;
    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    
    // 添加容错值来处理浮点数精度问题
    const tolerance = 3; // 增加容错值
    
    const canScrollLeft = scrollLeft > tolerance;
    const canScrollRight = scrollLeft < (scrollWidth - clientWidth - tolerance);
    
    // 特殊处理：当选中最后一个tab时，强制隐藏右侧阴影
    if (this.currentIndex === this.tabItems.length - 1) {
      // 计算最后一个tab是否完全可见
      const lastTabRect = this.tabItems[this.tabItems.length - 1].getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const lastTabRightEdge = lastTabRect.right;
      const containerRightEdge = containerRect.right - 20; // 减去padding
      
      // 如果最后一个tab完全可见，隐藏右侧阴影
      if (lastTabRightEdge <= containerRightEdge + tolerance) {
        container.classList.remove('can-scroll-right');
      } else {
        container.classList.toggle('can-scroll-right', canScrollRight);
      }
    } else {
      container.classList.toggle('can-scroll-right', canScrollRight);
    }
    
    container.classList.toggle('can-scroll-left', canScrollLeft);
    
    // 调试日志（可选，发布时删除）
    // console.log('Scroll indicators:', { canScrollLeft, canScrollRight, scrollLeft, scrollWidth, clientWidth, currentIndex: this.currentIndex });
  }
  
  destroy() {
    this.tabBar?.remove();
    // 清理备用监听器
    if (this.backupKeyListener) {
      window.removeEventListener('keydown', this.backupKeyListener, true);
    }
  }
}

class TabSwitchSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  
  display() {
    const { containerEl } = this;
    
    containerEl.empty();
    
    containerEl.createEl('h2', { text: 'Tab Switch Settings' });
    
    // 快捷键模式选择
    new Setting(containerEl)
      .setName('快捷键模式')
      .setDesc('选择使用单键模式还是组合键模式')
      .addDropdown(dropdown => dropdown
        .addOption('false', '单键模式 (按住键显示切换栏)')
        .addOption('true', '组合键模式 (组合键+方向键直接切换)')
        .setValue(this.plugin.settings.useComboKeys.toString())
        .onChange(async (value) => {
          this.plugin.settings.useComboKeys = value === 'true';
          await this.plugin.saveSettings();
          this.display(); // 重新渲染设置页面
        }));
    
    if (!this.plugin.settings.useComboKeys) {
      // 单键模式设置
      new Setting(containerEl)
        .setName('激活键')
        .setDesc('用于激活tab切换栏的快捷键')
        .addDropdown(dropdown => dropdown
          .addOption('Alt', 'Alt')
          .addOption('Control', 'Ctrl')
          .addOption('Meta', 'Cmd/Win')
          .setValue(this.plugin.settings.switchKey)
          .onChange(async (value) => {
            this.plugin.settings.switchKey = value;
            await this.plugin.saveSettings();
          }));
      
      // 严格单键模式设置
      new Setting(containerEl)
        .setName('严格单键模式')
        .setDesc('启用后，只有在单独按下激活键时才会触发，避免与其他组合键冲突')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.strictSingleKeyMode)
          .onChange(async (value) => {
            this.plugin.settings.strictSingleKeyMode = value;
            await this.plugin.saveSettings();
          }));
    } else {
      // 组合键模式设置
      containerEl.createEl('h3', { text: '组合键设置' });
      containerEl.createEl('p', { text: '选择需要的修饰键，然后使用 组合键+左右方向键 来切换标签页' });
      
      new Setting(containerEl)
        .setName('Command/Cmd键')
        .setDesc('包含Command键 (Mac) 或 Windows键')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.comboKeys.cmd)
          .onChange(async (value) => {
            this.plugin.settings.comboKeys.cmd = value;
            await this.plugin.saveSettings();
          }));
      
      new Setting(containerEl)
        .setName('Control键')
        .setDesc('包含Control键')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.comboKeys.ctrl)
          .onChange(async (value) => {
            this.plugin.settings.comboKeys.ctrl = value;
            await this.plugin.saveSettings();
          }));
      
      new Setting(containerEl)
        .setName('Alt/Option键')
        .setDesc('包含Alt键 (Windows) 或 Option键 (Mac)')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.comboKeys.alt)
          .onChange(async (value) => {
            this.plugin.settings.comboKeys.alt = value;
            await this.plugin.saveSettings();
          }));
      
      new Setting(containerEl)
        .setName('Shift键')
        .setDesc('包含Shift键')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.comboKeys.shift)
          .onChange(async (value) => {
            this.plugin.settings.comboKeys.shift = value;
            await this.plugin.saveSettings();
          }));
      
      // 显示当前组合键
      const comboText = this.getComboKeyText();
      containerEl.createEl('p', { 
        text: `当前组合键: ${comboText}`, 
        cls: 'setting-item-description'
      });
    }
  }
  
  getComboKeyText() {
    const keys = [];
    if (this.plugin.settings.comboKeys.cmd) keys.push('Cmd');
    if (this.plugin.settings.comboKeys.ctrl) keys.push('Ctrl');
    if (this.plugin.settings.comboKeys.alt) keys.push('Alt');
    if (this.plugin.settings.comboKeys.shift) keys.push('Shift');
    return keys.length > 0 ? keys.join(' + ') + ' + 左右方向键' : '未设置';
  }
}

module.exports = TabSwitchPlugin;