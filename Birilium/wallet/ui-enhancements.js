/**
 * Birilium Wallet UI Enhancements
 * Dark mode, toast notifications, network status, address book, and more
 */

// ============== DARK MODE ==============
const ThemeManager = {
    STORAGE_KEY: 'biriliumTheme',

    init() {
        // Load saved theme or detect system preference
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');

        this.setTheme(theme);
        this.createToggleButton();

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(this.STORAGE_KEY)) {
                this.setTheme(e.matches ? 'dark' : 'light');
            }
        });
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(this.STORAGE_KEY, theme);

        // Update toggle button icon
        const toggle = document.querySelector('.theme-toggle');
        if (toggle) {
            toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
            toggle.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        }
    },

    toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        this.setTheme(current === 'dark' ? 'light' : 'dark');
    },

    createToggleButton() {
        const toggle = document.createElement('button');
        toggle.className = 'theme-toggle';
        toggle.title = 'Toggle Dark Mode';
        toggle.onclick = () => this.toggle();
        document.body.appendChild(toggle);
    }
};

// ============== TOAST NOTIFICATIONS ==============
const Toast = {
    container: null,

    init() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 5000) {
        if (!this.container) this.init();

        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };

        // Build the toast via DOM APIs instead of innerHTML so a `message`
        // sourced from network data (server errors, peer-supplied text, etc.)
        // can never escape into executable HTML. With nodeIntegration=true
        // an HTML-injection here was full RCE on the user's machine.
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'toast-icon';
        iconSpan.textContent = icons[type] || icons.info;
        toast.appendChild(iconSpan);

        const msgSpan = document.createElement('span');
        msgSpan.className = 'toast-message';
        msgSpan.textContent = String(message);
        toast.appendChild(msgSpan);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => toast.remove());
        toast.appendChild(closeBtn);

        this.container.appendChild(toast);

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                toast.style.animation = 'slideInRight 0.3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        return toast;
    },

    success(message, duration) {
        return this.show(message, 'success', duration);
    },

    error(message, duration) {
        return this.show(message, 'error', duration);
    },

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    },

    info(message, duration) {
        return this.show(message, 'info', duration);
    }
};

// ============== NETWORK STATUS ==============
const NetworkStatus = {
    element: null,
    interval: null,
    status: 'disconnected',
    peers: 0,
    latency: 0,

    init(nodeUrl = 'https://api.birilium.com') {
        this.nodeUrl = nodeUrl;
        this.createStatusElement();
        this.startMonitoring();
    },

    createStatusElement() {
        const sidebar = document.querySelector('.sidebar .wallet-info');
        if (!sidebar) return;

        this.element = document.createElement('div');
        this.element.className = 'network-status';
        this.element.innerHTML = `
            <span class="network-dot disconnected"></span>
            <div class="network-info">
                <span class="network-label">Network</span>
                <span class="network-value">Connecting...</span>
            </div>
        `;

        sidebar.parentNode.insertBefore(this.element, sidebar.nextSibling);
    },

    async checkStatus() {
        const dot = this.element?.querySelector('.network-dot');
        const value = this.element?.querySelector('.network-value');
        if (!dot || !value) return;

        const startTime = Date.now();

        try {
            const response = await fetch(`${this.nodeUrl}/api/p2p/stats`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
                const data = await response.json();
                this.latency = Date.now() - startTime;
                this.peers = data.connectedPeers || 0;
                this.status = 'connected';

                dot.className = 'network-dot connected';
                value.textContent = `${this.peers} peer${this.peers !== 1 ? 's' : ''} • ${this.latency}ms`;
            } else {
                throw new Error('Bad response');
            }
        } catch (error) {
            if (this.status !== 'disconnected') {
                this.status = 'disconnected';
                dot.className = 'network-dot disconnected';
                value.textContent = 'Disconnected';
            }
        }
    },

    startMonitoring() {
        this.checkStatus();
        this.interval = setInterval(() => this.checkStatus(), 10000);
    },

    stopMonitoring() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
};

// ============== ADDRESS BOOK ==============
const AddressBook = {
    STORAGE_KEY: 'biriliumAddressBook',
    entries: [],

    init() {
        this.load();
    },

    load() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            this.entries = data ? JSON.parse(data) : [];
        } catch (e) {
            this.entries = [];
        }
    },

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.entries));
    },

    add(name, address, notes = '') {
        // Check for duplicate
        if (this.entries.some(e => e.address === address)) {
            Toast.warning('Address already exists in address book');
            return false;
        }

        this.entries.push({
            id: Date.now().toString(),
            name,
            address,
            notes,
            createdAt: Date.now()
        });

        this.save();
        Toast.success(`${name} added to address book`);
        return true;
    },

    remove(id) {
        const index = this.entries.findIndex(e => e.id === id);
        if (index !== -1) {
            const entry = this.entries[index];
            this.entries.splice(index, 1);
            this.save();
            Toast.info(`${entry.name} removed from address book`);
            return true;
        }
        return false;
    },

    update(id, updates) {
        const entry = this.entries.find(e => e.id === id);
        if (entry) {
            Object.assign(entry, updates);
            this.save();
            return true;
        }
        return false;
    },

    getAll() {
        return [...this.entries];
    },

    findByAddress(address) {
        return this.entries.find(e => e.address === address);
    },

    render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Empty container without using innerHTML.
        while (container.firstChild) container.removeChild(container.firstChild);

        if (this.entries.length === 0) {
            const p = document.createElement('p');
            p.className = 'no-transactions';
            p.textContent = 'No saved addresses';
            container.appendChild(p);
            return;
        }

        // Build each row via DOM APIs. Address-book entries come from a
        // backup file the user may import; an entry name or address
        // containing a quote or HTML payload would have escaped the
        // previous inline-onclick string and run arbitrary code (the
        // wallet runs with nodeIntegration=true).
        for (const entry of this.entries) {
            const safeAddress = String(entry.address || '');
            const safeName = String(entry.name || '');

            const item = document.createElement('div');
            item.className = 'address-item';
            item.dataset.id = entry.id;

            const avatar = document.createElement('div');
            avatar.className = 'address-avatar';
            avatar.textContent = safeName.charAt(0).toUpperCase();
            item.appendChild(avatar);

            const details = document.createElement('div');
            details.className = 'address-details';
            const nameDiv = document.createElement('div');
            nameDiv.className = 'address-name';
            nameDiv.textContent = safeName;
            details.appendChild(nameDiv);
            const valueDiv = document.createElement('div');
            valueDiv.className = 'address-value';
            valueDiv.textContent = safeAddress.length > 30
                ? `${safeAddress.substring(0, 20)}...${safeAddress.substring(safeAddress.length - 10)}`
                : safeAddress;
            details.appendChild(valueDiv);
            item.appendChild(details);

            const actions = document.createElement('div');
            actions.className = 'address-actions';
            const mkBtn = (cls, title, txt, onClick) => {
                const b = document.createElement('button');
                b.className = cls;
                b.title = title;
                b.textContent = txt;
                b.addEventListener('click', onClick);
                return b;
            };
            actions.appendChild(mkBtn('btn-icon', 'Copy Address', '📋',
                () => AddressBook.copyAddress(safeAddress)));
            actions.appendChild(mkBtn('btn-icon', 'Send to this address', '📤',
                () => AddressBook.useAddress(safeAddress)));
            actions.appendChild(mkBtn('btn-icon delete', 'Delete', '🗑', () => {
                AddressBook.remove(entry.id);
                AddressBook.render(containerId);
            }));
            item.appendChild(actions);

            container.appendChild(item);
        }
    },

    copyAddress(address) {
        navigator.clipboard.writeText(address).then(() => {
            Toast.success('Address copied to clipboard');
        });
    },

    useAddress(address) {
        const recipientInput = document.getElementById('recipientAddress');
        if (recipientInput) {
            recipientInput.value = address;
            // Switch to send view
            if (window.wallet) {
                window.wallet.switchView('transfer');
            }
            Toast.info('Address filled in send form');
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============== TRANSACTION LABELS ==============
const TransactionLabels = {
    STORAGE_KEY: 'biriliumTxLabels',
    labels: {},

    init() {
        this.load();
    },

    load() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            this.labels = data ? JSON.parse(data) : {};
        } catch (e) {
            this.labels = {};
        }
    },

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.labels));
    },

    setLabel(txHash, label) {
        this.labels[txHash] = label;
        this.save();
    },

    getLabel(txHash) {
        return this.labels[txHash] || null;
    },

    removeLabel(txHash) {
        delete this.labels[txHash];
        this.save();
    }
};

// ============== BACKUP REMINDER ==============
const BackupReminder = {
    STORAGE_KEY: 'biriliumLastBackup',
    REMINDER_INTERVAL: 7 * 24 * 60 * 60 * 1000, // 7 days

    init() {
        // Check if user has a wallet and hasn't backed up recently
        const hasWallet = localStorage.getItem('biriliumBlockchainWallet');
        if (!hasWallet) return;

        const lastBackup = localStorage.getItem(this.STORAGE_KEY);
        const timeSinceBackup = lastBackup ? Date.now() - parseInt(lastBackup) : Infinity;

        if (timeSinceBackup > this.REMINDER_INTERVAL) {
            this.showReminder();
        }
    },

    showReminder() {
        const reminder = document.createElement('div');
        reminder.className = 'backup-reminder';
        reminder.id = 'backupReminder';
        reminder.innerHTML = `
            <div class="backup-reminder-header">
                <span class="backup-reminder-icon">⚠️</span>
                <span class="backup-reminder-title">Backup Reminder</span>
                <button class="backup-reminder-close" onclick="BackupReminder.dismiss()">×</button>
            </div>
            <p class="backup-reminder-text">
                It's been a while since you backed up your wallet. Make sure your recovery phrase is safely stored!
            </p>
            <div class="backup-reminder-actions">
                <button class="backup-reminder-btn primary" onclick="BackupReminder.backup()">Backup Now</button>
                <button class="backup-reminder-btn secondary" onclick="BackupReminder.later()">Remind Later</button>
            </div>
        `;

        document.body.appendChild(reminder);
    },

    dismiss() {
        const reminder = document.getElementById('backupReminder');
        if (reminder) reminder.remove();
    },

    backup() {
        this.dismiss();
        localStorage.setItem(this.STORAGE_KEY, Date.now().toString());

        // Trigger wallet backup if available
        if (window.wallet && typeof window.wallet.exportWalletBackup === 'function') {
            window.wallet.exportWalletBackup();
        } else {
            Toast.info('Go to Manage Wallet to export your backup');
        }
    },

    later() {
        this.dismiss();
        // Set reminder for 1 day later
        const oneDayFromNow = Date.now() - this.REMINDER_INTERVAL + (24 * 60 * 60 * 1000);
        localStorage.setItem(this.STORAGE_KEY, oneDayFromNow.toString());
    },

    markBackedUp() {
        localStorage.setItem(this.STORAGE_KEY, Date.now().toString());
    }
};

// ============== MULTI-WALLET MANAGER ==============
const MultiWalletManager = {
    STORAGE_KEY: 'biriliumWallets',
    ACTIVE_KEY: 'biriliumActiveWallet',
    wallets: [],
    activeWalletId: null,

    init() {
        this.load();
    },

    load() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            this.wallets = data ? JSON.parse(data) : [];
            this.activeWalletId = localStorage.getItem(this.ACTIVE_KEY);
        } catch (e) {
            this.wallets = [];
        }
    },

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.wallets));
        if (this.activeWalletId) {
            localStorage.setItem(this.ACTIVE_KEY, this.activeWalletId);
        }
    },

    addWallet(name, address, encryptedData) {
        const id = Date.now().toString();
        this.wallets.push({
            id,
            name: name || `Wallet ${this.wallets.length + 1}`,
            address,
            encryptedData,
            createdAt: Date.now()
        });
        this.save();
        return id;
    },

    removeWallet(id) {
        const index = this.wallets.findIndex(w => w.id === id);
        if (index !== -1) {
            this.wallets.splice(index, 1);
            if (this.activeWalletId === id) {
                this.activeWalletId = this.wallets[0]?.id || null;
            }
            this.save();
            return true;
        }
        return false;
    },

    setActiveWallet(id) {
        const wallet = this.wallets.find(w => w.id === id);
        if (wallet) {
            this.activeWalletId = id;
            this.save();
            return wallet;
        }
        return null;
    },

    getActiveWallet() {
        return this.wallets.find(w => w.id === this.activeWalletId);
    },

    getAllWallets() {
        return [...this.wallets];
    },

    getWalletCount() {
        return this.wallets.length;
    }
};

// ============== CONFIRMATION DISPLAY ==============
const ConfirmationDisplay = {
    getConfirmationLevel(confirmations) {
        if (confirmations === 0) return { level: 'pending', text: 'Pending', icon: '⏳' };
        if (confirmations < 3) return { level: 'low', text: `${confirmations}/3`, icon: '⚠️' };
        return { level: 'confirmed', text: `${confirmations}+`, icon: '✓' };
    },

    createBadge(confirmations) {
        const { level, text, icon } = this.getConfirmationLevel(confirmations);
        return `<span class="tx-confirmations ${level}">${icon} ${text}</span>`;
    }
};

// ============== INITIALIZE ALL ENHANCEMENTS ==============
function initUIEnhancements() {
    console.log('Initializing UI Enhancements...');

    // Initialize all modules
    ThemeManager.init();
    Toast.init();
    NetworkStatus.init();
    AddressBook.init();
    TransactionLabels.init();
    MultiWalletManager.init();

    // Show backup reminder after a short delay
    setTimeout(() => {
        BackupReminder.init();
    }, 5000);

    console.log('UI Enhancements initialized');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUIEnhancements);
} else {
    initUIEnhancements();
}

// Export for global access
window.ThemeManager = ThemeManager;
window.Toast = Toast;
window.NetworkStatus = NetworkStatus;
window.AddressBook = AddressBook;
window.TransactionLabels = TransactionLabels;
window.BackupReminder = BackupReminder;
window.MultiWalletManager = MultiWalletManager;
window.ConfirmationDisplay = ConfirmationDisplay;
