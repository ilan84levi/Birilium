// Extracted from inline <script> blocks in index.html so we can drop
// `script-src 'unsafe-inline'` from the CSP. With nodeIntegration=true
// any inline-script injection used to be RCE; the inline scripts were
// the defense-in-depth gap.
//
// Loads PayPal client config from the backend, then loads the PayPal
// SDK and renders the subscription button.

let PAYPAL_CLIENT_ID = '';
let PAYPAL_PLAN_ID = '';
let PAYPAL_SANDBOX_MODE = false;

async function loadPayPalConfig(retries = 10, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch('https://api.birilium.com/api/paypal-config');
            if (response.ok) {
                const config = await response.json();
                if (config.clientId) {
                    PAYPAL_CLIENT_ID = config.clientId;
                    PAYPAL_PLAN_ID = config.planId;
                    PAYPAL_SANDBOX_MODE = config.sandboxMode;
                    console.log('PayPal config loaded successfully');
                    return true;
                }
            }
        } catch (error) {
            if (i < retries - 1) {
                console.log(`PayPal config not available yet (attempt ${i + 1}/${retries}), retrying...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('Failed to load PayPal configuration after ' + retries + ' attempts:', error);
            }
        }
    }
    return false;
}

(async function () {
    const configLoaded = await loadPayPalConfig();
    if (!configLoaded) {
        console.error('Failed to load PayPal configuration - button will not load');
        return;
    }

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription&locale=en_US`;
    script.setAttribute('data-sdk-integration-source', 'button-factory');
    script.onload = function () { initializePayPalButton(); };
    document.head.appendChild(script);
})();

function initializePayPalButton() {
    if (typeof paypal === 'undefined') return;

    if (PAYPAL_SANDBOX_MODE) {
        const indicator = document.createElement('div');
        indicator.style.cssText = 'background: #ffc107; color: #000; padding: 10px; text-align: center; font-weight: bold; border-radius: 8px; margin-bottom: 15px;';
        indicator.textContent = '⚠️ SANDBOX MODE - Test payments only (no real money)';
        const container = document.getElementById('paypal-button-container-P-2AE31843879973003ND5UCTA');
        if (container && container.parentNode) {
            container.parentNode.insertBefore(indicator, container);
        }
    }

    paypal.Buttons({
        style: { shape: 'pill', color: 'blue', layout: 'vertical', label: 'subscribe', height: 45 },
        createSubscription: function (data, actions) {
            return actions.subscription.create({ plan_id: PAYPAL_PLAN_ID });
        },
        onApprove: async function (data, actions) {
            console.log('PayPal subscription approved:', data.subscriptionID);
            if (!window.wallet || !window.wallet.walletAddress) {
                alert('Error: No wallet address found. Please create a wallet first.');
                return;
            }
            const walletAddress = window.wallet.walletAddress;
            try {
                const response = await window.wallet.fetchWithRetry('https://api.birilium.com/api/subscription/activate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        walletAddress: walletAddress,
                        subscriptionId: data.subscriptionID,
                        planId: PAYPAL_PLAN_ID,
                        amount: 5.00,
                        currency: 'USD',
                        timestamp: Date.now()
                    })
                }, 5);
                const result = await response.json();
                if (result.success) {
                    window.wallet.hasSubscription = true;
                    window.wallet.subscriptionId = data.subscriptionID;
                    window.wallet.subscriptionStartDate = Date.now();
                    window.wallet.saveWallet();
                    window.wallet.updateUI();
                    alert('🎉 Premium subscription activated successfully!\n\nYou can now:\n✓ Mine unlimited coins\n✓ Create unlimited wallets');
                    const subscriptionStatus = document.getElementById('subscriptionStatus');
                    if (subscriptionStatus) {
                        subscriptionStatus.textContent = '✓ Active Premium Subscription';
                        subscriptionStatus.style.color = '#28a745';
                    }
                } else {
                    alert('Subscription payment successful, but failed to activate in system.\nError: ' + result.error + '\n\nPlease contact support with your subscription ID: ' + data.subscriptionID);
                }
            } catch (error) {
                console.error('Error activating subscription:', error);
                alert('Subscription payment successful, but failed to connect to blockchain node.\n\nYour subscription ID: ' + data.subscriptionID + '\n\nPlease save this ID and contact support.');
            }
        },
        onError: function (err) {
            console.error('PayPal error:', err);
            alert('PayPal payment failed. Please try again or contact support.');
        }
    }).render('#paypal-button-container-P-2AE31843879973003ND5UCTA');
}

// Delegated handler for the copy-to-clipboard buttons. Replaces inline
// `onclick="copyToClipboard('walletAddress')"` attributes that required
// `script-src 'unsafe-inline'` in the CSP. Buttons now declare
// `data-copy-target="walletAddress"` instead.
document.addEventListener('click', function (event) {
    const btn = event.target.closest('[data-copy-target]');
    if (!btn) return;
    event.preventDefault();
    const targetId = btn.getAttribute('data-copy-target');
    if (typeof copyToClipboard === 'function') {
        copyToClipboard(targetId);
    }
});
