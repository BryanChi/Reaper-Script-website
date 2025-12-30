(function() {
	'use strict';

	// Smooth scroll for same-page anchors
	document.addEventListener('click', function(e) {
		const target = e.target;
		if (target instanceof HTMLElement && target.tagName === 'A') {
			const href = target.getAttribute('href') || '';
			if (href.startsWith('#') && href.length > 1) {
				e.preventDefault();
				const el = document.querySelector(href);
				if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}
	}, false);

	// Header scroll effect
	const header = document.querySelector('.site-header');
	function updateHeader() {
		if (!header) return;
		if (window.scrollY > 20) {
			header.classList.add('scrolled');
		} else {
			header.classList.remove('scrolled');
		}
	}
	window.addEventListener('scroll', updateHeader);
	updateHeader();

	// Authentication (Supabase)
	const authConfig = {
		supabaseUrl: document.body?.dataset?.supabaseUrl || '',
		supabaseAnonKey: document.body?.dataset?.supabaseAnonKey || '',
		redirectTo: document.body?.dataset?.supabaseRedirect || window.location.origin
	};

	const loginButton = document.getElementById('loginButton');
	const authModal = document.getElementById('auth-modal');
	const closeAuthModal = document.getElementById('closeAuthModal');
	const authTabs = Array.from(document.querySelectorAll('.auth-tab'));
	const authMessage = document.getElementById('authMessage');
	const emailAuthForm = document.getElementById('emailAuthForm');
	const emailSubmit = document.getElementById('emailSubmit');
	const authEmailInput = document.getElementById('authEmail');
	const authPasswordInput = document.getElementById('authPassword');
	const authPasswordConfirmInput = document.getElementById('authPasswordConfirm');
	const googleSignIn = document.getElementById('googleSignIn');
	const userMenu = document.getElementById('userMenu');
	const userMenuButton = document.getElementById('userMenuButton');
	const userMenuPanel = document.getElementById('userMenuPanel');
	const logoutButton = document.getElementById('logoutButton');
	const userEmailDisplay = document.getElementById('userEmailDisplay');
	const userEmailFull = document.getElementById('userEmailFull');
	const userAvatar = document.getElementById('userAvatar');
	const userAvatarSmall = document.getElementById('userAvatarSmall');

	let authMode = 'signin';
	let supabaseClient = null;
	let currentUser = null;
	let userMenuHTML = null; // Store user menu HTML for recreation

	// Helper functions to get user menu elements (they may be removed/recreated)
	function getUserMenu() { return document.getElementById('userMenu'); }
	function getUserMenuButton() { return document.getElementById('userMenuButton'); }
	function getUserMenuPanel() { return document.getElementById('userMenuPanel'); }
	function getLogoutButton() { return document.getElementById('logoutButton'); }
	function getUserEmailDisplay() { return document.getElementById('userEmailDisplay'); }
	function getUserEmailFull() { return document.getElementById('userEmailFull'); }
	function getUserAvatar() { return document.getElementById('userAvatar'); }
	function getUserAvatarSmall() { return document.getElementById('userAvatarSmall'); }

	function createSupabaseClient() {
		if (!window.supabase || !authConfig.supabaseUrl || !authConfig.supabaseAnonKey) {
			return null;
		}
		try {
			return window.supabase.createClient(authConfig.supabaseUrl, authConfig.supabaseAnonKey, {
				auth: { persistSession: true, autoRefreshToken: true }
			});
		} catch (err) {
			console.error('Failed to init Supabase:', err);
			return null;
		}
	}

	function openAuthModal() {
		if (!authModal) return;
		authModal.style.display = 'flex';
		setTimeout(function() { authModal.classList.add('active'); }, 10);
		authEmailInput && authEmailInput.focus();
		if (!supabaseClient && authMessage) {
			authMessage.textContent = 'Add Supabase URL and anon key to the <body> data attributes to enable login.';
		} else if (authMessage) {
			authMessage.textContent = '';
		}
	}

	function hideAuthModal() {
		if (!authModal) return;
		authModal.classList.remove('active');
		setTimeout(function() { authModal.style.display = 'none'; }, 180);
	}

	function setAuthMode(mode) {
		authMode = mode;
		authTabs.forEach(function(tab) {
			tab.classList.toggle('active', tab.dataset.mode === mode);
		});
		if (emailSubmit) {
			emailSubmit.textContent = mode === 'signup' ? 'Create account' : 'Log in';
		}
		if (authPasswordInput) {
			if (mode === 'signup') {
				authPasswordInput.placeholder = 'Password (min 6 chars)';
				authPasswordInput.autocomplete = 'new-password';
			} else {
				authPasswordInput.autocomplete = 'current-password';
			}
		}
		// Show/hide password confirmation field
		if (authPasswordConfirmInput) {
			authPasswordConfirmInput.style.display = mode === 'signup' ? 'block' : 'none';
			authPasswordConfirmInput.required = mode === 'signup';
			if (mode === 'signup') {
				authPasswordConfirmInput.placeholder = 'Confirm password';
			} else {
				// Clear the field when switching to signin mode
				authPasswordConfirmInput.value = '';
			}
		}
		if (authMessage) authMessage.textContent = '';
	}

	function userInitials(user) {
		const email = user?.email || '';
		if (!email) return 'U';
		return email.charAt(0).toUpperCase();
	}

	function recreateUserMenu() {
		const authControls = document.querySelector('.auth-controls');
		if (!authControls || userMenuHTML === null) return;
		
		// Create a temporary container to parse HTML
		const temp = document.createElement('div');
		temp.innerHTML = userMenuHTML;
		const newUserMenu = temp.firstElementChild;
		
		// Insert before the Buy Now button (or at end of auth-controls)
		authControls.insertBefore(newUserMenu, authControls.querySelector('.buy-now') || null);
		
		// Reattach event listeners
		setupUserMenuListeners();
	}

	function setupUserMenuListeners() {
		const menuButton = getUserMenuButton();
		const menuPanel = getUserMenuPanel();
		const logoutBtn = getLogoutButton();
		
		if (menuButton && menuPanel) {
			menuButton.addEventListener('click', function(e) {
				e.stopPropagation();
				const wasHidden = menuPanel.hidden;
				menuPanel.hidden = !menuPanel.hidden;
				// Load license info when opening the menu
				if (wasHidden && currentUser) {
					loadLicenseInfo();
				}
			});

			document.addEventListener('click', function(e) {
				if (menuPanel.hidden) return;
				if (!menuPanel.contains(e.target) && !menuButton.contains(e.target)) {
					menuPanel.hidden = true;
				}
			});
		}

		if (logoutBtn) {
			logoutBtn.addEventListener('click', async function() {
				if (!supabaseClient) {
					updateUserUI(null);
					return;
				}
				try {
					await supabaseClient.auth.signOut();
				} catch (err) {
					console.error('Sign out failed:', err);
				} finally {
					updateUserUI(null);
				}
			});
		}

		// Setup refresh license button
		const refreshLicenseBtn = document.getElementById('refreshLicenseBtn');
		if (refreshLicenseBtn) {
			refreshLicenseBtn.addEventListener('click', function(e) {
				e.stopPropagation();
				loadLicenseInfo();
			});
		}
	}

	async function loadLicenseInfo() {
		const email = getSignedInEmail();
		if (!email) return;

		const licenseStatusDisplay = document.getElementById('licenseStatusDisplay');
		if (!licenseStatusDisplay) return;

		licenseStatusDisplay.innerHTML = '<div class="license-loading">Loading license information...</div>';

		try {
			const res = await postJson('/api/license/info', { email });
			
			// Debug logging
			console.log('License info response:', res);
			if (res._debug) {
				console.log('Debug info:', res._debug);
			}
			
			if (!res.ok) {
				licenseStatusDisplay.innerHTML = `<div class="license-error">Unable to load license information.</div>`;
				return;
			}

			let html = '';

			// License key section
			if (res.licenseKey) {
				html += `<div class="license-key-section">
					<div class="license-key-label">License Key:</div>
					<div class="license-key-value">
						<code class="license-key-code">${res.licenseKey}</code>
						<button class="btn-copy-key" data-key="${res.licenseKey}" title="Copy license key">📋</button>
					</div>
				</div>`;
			} else {
				html += `<div class="license-key-section">
					<div class="license-status-badge status-${res.status}">Status: ${res.status || 'inactive'}</div>
					<div class="license-no-key">No active license found.</div>
				</div>`;
			}

			// License status
			if (res.licenseKey) {
				const statusClass = res.status === 'active' ? 'status-active' : (res.status === 'trial' ? 'status-trial' : 'status-inactive');
				html += `<div class="license-status-section">
					<div class="license-status-badge ${statusClass}">Status: ${res.status || 'inactive'}</div>
					${res.expiresAt ? `<div class="license-expiry">Expires: ${prettyExpiry(res.expiresAt)}</div>` : (res.status === 'trial' ? '' : '<div class="license-expiry">Lifetime license</div>')}
				</div>`;
			}

			// Device activations section
			if (res.licenseKey && res.activations && res.activations.length > 0) {
				html += `<div class="device-activations-section">
					<div class="device-activations-header">Device Activations (${res.activations.length})</div>
					<div class="device-activations-list">`;
				
				res.activations.forEach(function(activation) {
					const activatedDate = activation.activated_at ? prettyExpiry(new Date(activation.activated_at).getTime()) : 'Unknown';
					html += `<div class="device-activation-item">
						<div class="device-info">
							<div class="device-id">${escapeHtml(activation.device_id || 'Unknown Device')}</div>
							<div class="device-activated-date">Activated: ${activatedDate}</div>
						</div>
						<button class="btn-deactivate-device" data-license-key="${escapeHtml(res.licenseKey)}" data-device-id="${escapeHtml(activation.device_id)}" title="Deactivate device">Deactivate</button>
					</div>`;
				});
				
				html += `</div></div>`;
			} else if (res.licenseKey) {
				// Check if activations is actually an array or if it's null/undefined
				const activationsInfo = res.activations === null ? 'null' : 
				                      res.activations === undefined ? 'undefined' : 
				                      Array.isArray(res.activations) ? `array with ${res.activations.length} items` : 
				                      typeof res.activations;
				
				html += `<div class="device-activations-section">
					<div class="device-activations-header">Device Activations</div>
					<div class="device-activations-empty">No active device activations.
					${res._debug ? `<br><small style="color: #9ca3af; font-size: 10px;">Debug: activations=${activationsInfo}, licenseKey=${res.licenseKey}</small>` : ''}
					<br><small style="color: #9ca3af; font-size: 10px;">Note: Device activations are created when you run the Reaper script with this license key.</small>
					</div>
				</div>`;
			}

			licenseStatusDisplay.innerHTML = html;

			// Setup copy button handlers
			const copyButtons = licenseStatusDisplay.querySelectorAll('.btn-copy-key');
			copyButtons.forEach(function(btn) {
				btn.addEventListener('click', function(e) {
					e.stopPropagation();
					const key = btn.getAttribute('data-key');
					if (key) {
						navigator.clipboard.writeText(key).then(function() {
							btn.textContent = '✓';
							setTimeout(function() {
								btn.textContent = '📋';
							}, 1500);
						}).catch(function() {
							btn.textContent = '✗';
							setTimeout(function() {
								btn.textContent = '📋';
							}, 1500);
						});
					}
				});
			});

			// Setup deactivate device button handlers
			const deactivateButtons = licenseStatusDisplay.querySelectorAll('.btn-deactivate-device');
			deactivateButtons.forEach(function(btn) {
				btn.addEventListener('click', async function(e) {
					e.stopPropagation();
					const licenseKey = btn.getAttribute('data-license-key');
					const deviceId = btn.getAttribute('data-device-id');
					
					if (!confirm(`Are you sure you want to deactivate device "${deviceId}"?`)) {
						return;
					}

					btn.disabled = true;
					btn.textContent = 'Deactivating...';

					try {
						const result = await postJson('/api/device?action=deactivate', {
							email: email,
							licenseKey: licenseKey,
							deviceId: deviceId,
							action: 'deactivate'
						});

						if (result.ok) {
							// Reload license info
							loadLicenseInfo();
						} else {
							alert('Failed to deactivate device: ' + (result.error || 'Unknown error'));
							btn.disabled = false;
							btn.textContent = 'Deactivate';
						}
					} catch (err) {
						alert('Error deactivating device: ' + (err.message || 'Unknown error'));
						btn.disabled = false;
						btn.textContent = 'Deactivate';
					}
				});
			});

		} catch (err) {
			console.error('Failed to load license info:', err);
			licenseStatusDisplay.innerHTML = `<div class="license-error">Error loading license information: ${err.message || 'Unknown error'}</div>`;
		}
	}

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	function updateUserUI(user) {
		currentUser = user || null;
		const email = user?.email || '';
		const hasUser = Boolean(user);

		if (loginButton) {
			loginButton.style.display = hasUser ? 'none' : 'inline-flex';
		}
		
		const currentUserMenu = getUserMenu();
		
		// Store user menu HTML on first access if not already stored
		if (currentUserMenu && userMenuHTML === null) {
			userMenuHTML = currentUserMenu.outerHTML;
		}
		
		if (currentUserMenu) {
			if (hasUser) {
				// Show user menu if user is signed in
				currentUserMenu.hidden = false;
			} else {
				// Remove user menu from DOM if user is not signed in
				currentUserMenu.remove();
			}
		} else if (hasUser && userMenuHTML) {
			// Recreate user menu if user signed in and it was removed
			recreateUserMenu();
		}
		
		// Update user menu content if it exists
		const menu = getUserMenu();
		if (menu && hasUser) {
			const menuPanel = getUserMenuPanel();
			const emailDisplay = getUserEmailDisplay();
			const emailFull = getUserEmailFull();
			const avatar = getUserAvatar();
			const avatarSmall = getUserAvatarSmall();
			
			if (menuPanel) {
				menuPanel.hidden = true;
			}
			if (emailDisplay) {
				emailDisplay.textContent = email || '';
			}
			if (emailFull) {
				emailFull.textContent = email || '';
			}
			const initials = userInitials(user);
			if (avatar) avatar.textContent = initials;
			if (avatarSmall) avatarSmall.textContent = initials;
		}
		
		updateLicenseUserText(user);
		if (!hasUser) {
			setBadge('inactive', 'Sign in to start a trial or check your license.');
		}
		if (!hasUser && authModal) {
			hideAuthModal();
		}
	}

	async function hydrateSession() {
		if (!supabaseClient) return;
		try {
			const { data, error } = await supabaseClient.auth.getSession();
			if (error) throw error;
			updateUserUI(data?.session?.user || null);
			if (data?.session?.user) {
				refreshLicenseStatus({ targetMessage: licenseMessage });
			}
		} catch (err) {
			console.error('Failed to get session:', err);
			updateUserUI(null);
		}

		supabaseClient.auth.onAuthStateChange(function(_event, session) {
			updateUserUI(session?.user || null);
			if (session?.user) {
				hideAuthModal();
				refreshLicenseStatus({ targetMessage: licenseMessage });
			}
		});
	}

	function ensureSupabase() {
		if (!supabaseClient) {
			if (authMessage) {
				authMessage.textContent = 'Supabase auth is not configured. Set data-supabase-url and data-supabase-anon-key on <body>.';
			}
			return false;
		}
		return true;
	}

	function setupAuthUI() {
		supabaseClient = createSupabaseClient();
		if (supabaseClient) {
			hydrateSession();
		} else {
			updateUserUI(null);
		}

		if (loginButton) {
			loginButton.addEventListener('click', function() {
				openAuthModal();
			});
		}

		if (closeAuthModal) {
			closeAuthModal.addEventListener('click', hideAuthModal);
		}

		if (authModal) {
			authModal.addEventListener('click', function(e) {
				if (e.target === authModal) hideAuthModal();
			});
		}

		authTabs.forEach(function(tab) {
			tab.addEventListener('click', function() {
				setAuthMode(tab.dataset.mode === 'signup' ? 'signup' : 'signin');
			});
		});

		if (googleSignIn) {
			googleSignIn.addEventListener('click', async function() {
				if (!ensureSupabase()) return;
				googleSignIn.disabled = true;
				try {
					const { error } = await supabaseClient.auth.signInWithOAuth({
						provider: 'google',
						options: { redirectTo: authConfig.redirectTo || window.location.href }
					});
					if (error) throw error;
					if (authMessage) authMessage.textContent = 'Redirecting to Google...';
				} catch (err) {
					console.error('Google login failed:', err);
					if (authMessage) authMessage.textContent = err.message || 'Unable to start Google login.';
				} finally {
					googleSignIn.disabled = false;
				}
			});
		}

		if (emailAuthForm) {
			emailAuthForm.addEventListener('submit', async function(e) {
				e.preventDefault();
				if (!ensureSupabase()) return;
				const email = (authEmailInput?.value || '').trim();
				const password = authPasswordInput?.value || '';
				const passwordConfirm = authPasswordConfirmInput?.value || '';
				if (!email || !password) {
					if (authMessage) authMessage.textContent = 'Email and password are required.';
					return;
				}
				if (password.length < 6) {
					if (authMessage) authMessage.textContent = 'Password must be at least 6 characters.';
					return;
				}
				// Validate password confirmation for signup
				if (authMode === 'signup') {
					if (!passwordConfirm) {
						if (authMessage) authMessage.textContent = 'Please confirm your password.';
						return;
					}
					if (password !== passwordConfirm) {
						if (authMessage) authMessage.textContent = 'Passwords do not match.';
						return;
					}
				}
				if (emailSubmit) {
					emailSubmit.disabled = true;
					emailSubmit.textContent = authMode === 'signup' ? 'Creating account...' : 'Logging in...';
				}
				if (authMessage) authMessage.textContent = '';
				try {
					if (authMode === 'signup') {
						const { data, error } = await supabaseClient.auth.signUp({
							email,
							password,
							options: { emailRedirectTo: authConfig.redirectTo || window.location.origin }
						});
						if (error) throw error;
						updateUserUI(data?.user || null);
						
						// Send custom verification email with "Start Trial" button
						try {
							const apiBase = (document.body && document.body.dataset.apiBase) || '';
							await fetch((apiBase || '') + '/api/auth/send-verification-email', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ email })
							});
						} catch (emailErr) {
							console.error('Failed to send custom verification email:', emailErr);
							// Don't fail the signup if custom email fails
						}
						
						if (authMessage) {
							authMessage.innerHTML = 'Check your email to confirm your account and start your trial. <br><button type="button" id="resendConfirmationBtn" style="margin-top: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: var(--primary); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">Resend confirmation email</button>';
							const resendBtn = document.getElementById('resendConfirmationBtn');
							if (resendBtn) {
								resendBtn.addEventListener('click', async function() {
									resendBtn.disabled = true;
									resendBtn.textContent = 'Sending...';
									try {
										const { error: resendError } = await supabaseClient.auth.resend({
											type: 'signup',
											email: email
										});
										if (resendError) throw resendError;
										resendBtn.textContent = 'Email sent!';
										setTimeout(() => {
											resendBtn.textContent = 'Resend confirmation email';
											resendBtn.disabled = false;
										}, 3000);
									} catch (resendErr) {
										console.error('Failed to resend confirmation:', resendErr);
										resendBtn.textContent = 'Failed to send';
										setTimeout(() => {
											resendBtn.textContent = 'Resend confirmation email';
											resendBtn.disabled = false;
										}, 3000);
									}
								});
							}
						}
					} else {
						const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
						if (error) throw error;
						updateUserUI(data?.user || data?.session?.user || null);
						hideAuthModal();
					}
				} catch (err) {
					console.error('Email auth error:', err);
					console.error('Error details:', JSON.stringify(err, null, 2));
					let errorMessage = err.message || 'Unable to authenticate.';
					
					// Provide user-friendly messages for common error types
					if (err.message) {
						const lowerMessage = err.message.toLowerCase();
						const errorCode = err.status || err.code || '';
						
						// Supabase returns "Invalid login credentials" for unconfirmed emails
						// Check for email not confirmed errors - Supabase error code 400 with specific messages
						if (lowerMessage.includes('email not confirmed') || 
						    lowerMessage.includes('email_not_confirmed') ||
						    lowerMessage.includes('not confirmed') ||
						    lowerMessage.includes('confirm your email') ||
						    lowerMessage.includes('email address is not confirmed') ||
						    (err.status === 400 && (lowerMessage.includes('email') || lowerMessage.includes('invalid'))) ||
						    errorCode === 'email_not_confirmed') {
							errorMessage = 'Please verify your email address before signing in. Check your inbox (and spam folder) for the confirmation email from Supabase.';
						}
						// Check for invalid credentials - but only if it's NOT an email confirmation issue
						else if (lowerMessage.includes('invalid login') || 
						         lowerMessage.includes('invalid credentials') ||
						         lowerMessage.includes('wrong password') ||
						         lowerMessage.includes('incorrect password') ||
						         lowerMessage.includes('invalid login credentials')) {
							// For signin attempts, "invalid credentials" might mean unconfirmed email
							if (authMode === 'signin') {
								errorMessage = 'Invalid email or password. If you just created an account, please verify your email first. Check your inbox (and spam folder) for the confirmation email from Supabase.';
							} else {
								errorMessage = 'Invalid email or password. Please check your credentials and try again.';
							}
						}
						// Check for leaked password errors (various possible messages)
						else if (lowerMessage.includes('breach') || 
						    lowerMessage.includes('pwned') || 
						    lowerMessage.includes('compromised') ||
						    lowerMessage.includes('leaked') ||
						    lowerMessage.includes('data breach')) {
							errorMessage = 'This password has appeared in a data breach. Please choose a different, stronger password.';
						}
						// Check for weak password errors
						else if (lowerMessage.includes('weak') || lowerMessage.includes('too common')) {
							errorMessage = 'This password is too weak or commonly used. Please choose a stronger password.';
						}
						// Check for password policy violations
						else if (lowerMessage.includes('password') && (lowerMessage.includes('invalid') || lowerMessage.includes('not allowed'))) {
							errorMessage = 'This password does not meet security requirements. Please choose a different password.';
						}
					}
					
					if (authMessage) {
						authMessage.textContent = errorMessage;
						// If it's a signin error, add a helpful note about email confirmation
						if (authMode === 'signin' && (errorMessage.includes('verify') || errorMessage.includes('confirm'))) {
							authMessage.innerHTML = errorMessage + '<br><small style="color: var(--text-muted); margin-top: 8px; display: block;">Tip: Look for an email from Supabase (not from us) with the subject "Confirm your signup"</small>';
						}
					}
				} finally {
					if (emailSubmit) {
						emailSubmit.disabled = false;
						emailSubmit.textContent = authMode === 'signup' ? 'Create account' : 'Log in';
					}
				}
			});
		}

		// Setup user menu listeners (will be called on initial load and after recreation)
		setupUserMenuListeners();
	}

	setupAuthUI();

	// Set current year in footer
	const yearEl = document.getElementById('year');
	if (yearEl) yearEl.textContent = String(new Date().getFullYear());

	// Handle Buy buttons via Payment Link (Stripe, Lemon Squeezy, Paddle, etc.)
	function wireBuyButtons() {
		const buttons = [
			document.getElementById('buyButton'),
			document.getElementById('buyNowTop')
		].filter(Boolean);

		buttons.forEach(function(btn) {
			btn.addEventListener('click', function(e) {
				e.preventDefault();
				const paymentLink = btn.getAttribute('data-payment-link');
				if (paymentLink && paymentLink.trim().length > 0) {
					window.location.href = paymentLink;
				} else {
					// Fallback to PayPal buttons if no direct link is set
					const paypalEl = document.getElementById('paypal-button-container');
					if (paypalEl) {
						paypalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
						return;
					}
					alert('Connect a checkout link first. Edit data-payment-link on the Buy buttons.');
				}
			});
		});
	}

	wireBuyButtons();

	// Scroll reveal for elements with [data-reveal] - Enhanced with stagger
	function setupReveal() {
		const els = Array.from(document.querySelectorAll('[data-reveal]'));
		
		// Preload all carousel slides immediately (no lazy loading)
		const carouselSlides = Array.from(document.querySelectorAll('.carousel-slide[data-reveal]'));
		carouselSlides.forEach(function(slide) {
			slide.classList.add('visible');
			// Preload videos in carousel slides
			const videos = slide.querySelectorAll('video');
			videos.forEach(function(video) {
				video.load(); // Force video to load metadata
				video.preload = 'auto'; // Ensure preloading
			});
		});
		
		// Filter out carousel slides from the regular reveal observer
		const nonCarouselEls = els.filter(function(el) {
			return !el.closest('.carousel-slide');
		});
		
		if (!('IntersectionObserver' in window)) {
			nonCarouselEls.forEach(function(el) { el.classList.add('visible'); });
			return;
		}
		
		// Use a more aggressive threshold and rootMargin for earlier triggering
		const io = new IntersectionObserver(function(entries) {
			entries.forEach(function(entry) {
				if (entry.isIntersecting) {
					// Remove delay for immediate feedback, handle stagger in CSS
					entry.target.classList.add('visible');
					io.unobserve(entry.target);
				}
			});
		}, { 
			threshold: 0.05, // Lower threshold
			rootMargin: '0px 0px -50px 0px' // Trigger slightly before bottom
		});
		
		nonCarouselEls.forEach(function(el) { io.observe(el); });
	}

	setupReveal();

	// Sends Header Scroll-Driven Animation
	function setupSendsHeaderAnimation() {
		const header = document.querySelector('.sends-header');
		if (!header) return;

		function updateAnimation() {
			const rect = header.getBoundingClientRect();
			const windowHeight = window.innerHeight;
			
			// Calculate progress based on position
			// Start: entering bottom of viewport (rect.top <= windowHeight)
			// End: 30% from bottom (rect.top <= windowHeight * 0.7) - meaning it clears well before center
			
			const startPoint = windowHeight;
			const endPoint = windowHeight * 0.7; // 30% up from bottom
			
			if (rect.top > startPoint) {
				// Not visible yet
				header.style.opacity = '0';
				header.style.filter = 'blur(20px)';
				header.style.transform = 'scale(0.9)';
			} else if (rect.top < endPoint) {
				// Fully visible
				header.style.opacity = '1';
				header.style.filter = 'blur(0px)';
				header.style.transform = 'scale(1)';
			} else {
				// In between - interpolate
				const range = startPoint - endPoint;
				const current = startPoint - rect.top;
				const progress = Math.min(Math.max(current / range, 0), 1);
				
				// Ease the progress
				const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
				
				header.style.opacity = progress.toFixed(2);
				header.style.filter = `blur(${(20 * (1 - eased)).toFixed(1)}px)`;
				header.style.transform = `scale(${0.9 + (0.1 * eased)})`;
			}
		}

		// Update on scroll
		window.addEventListener('scroll', function() {
			window.requestAnimationFrame(updateAnimation);
		}, { passive: true });
		
		// Initial check
		updateAnimation();
	}

	setupSendsHeaderAnimation();

	// FX List Title Scroll-Driven Animation
	function setupFXListTitleAnimation() {
		const title = document.querySelector('.fx-list-title');
		if (!title) return;

		function updateAnimation() {
			const rect = title.getBoundingClientRect();
			const windowHeight = window.innerHeight;
			
			// Calculate progress based on position
			// Start: entering bottom of viewport (rect.top <= windowHeight)
			// End: 30% from bottom (rect.top <= windowHeight * 0.7) - meaning it clears well before center
			
			const startPoint = windowHeight;
			const endPoint = windowHeight * 0.7; // 30% up from bottom
			
			if (rect.top > startPoint) {
				// Not visible yet
				title.style.opacity = '0';
				title.style.filter = 'blur(20px)';
				title.style.transform = 'scale(0.9)';
			} else if (rect.top < endPoint) {
				// Fully visible
				title.style.opacity = '1';
				title.style.filter = 'blur(0px)';
				title.style.transform = 'scale(1)';
			} else {
				// In between - interpolate
				const range = startPoint - endPoint;
				const current = startPoint - rect.top;
				const progress = Math.min(Math.max(current / range, 0), 1);
				
				// Ease the progress
				const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
				
				title.style.opacity = progress.toFixed(2);
				title.style.filter = `blur(${(20 * (1 - eased)).toFixed(1)}px)`;
				title.style.transform = `scale(${0.9 + (0.1 * eased)})`;
			}
		}

		// Update on scroll
		window.addEventListener('scroll', function() {
			window.requestAnimationFrame(updateAnimation);
		}, { passive: true });
		
		// Initial check
		updateAnimation();
	}

	setupFXListTitleAnimation();

	// Interactive feature effects
	function setupFeatureInteractions() {
		// Hero video - always play (if video exists)
		const heroVideo = document.querySelector('.hero-video');
		const heroBackground = document.querySelector('.hero-background');
		if (heroVideo) {
			// Update play icon visibility for hero video
			function updateHeroPlayIcon() {
				if (heroBackground) {
					if (heroVideo.paused) {
						heroBackground.classList.add('hero-video-paused');
					} else {
						heroBackground.classList.remove('hero-video-paused');
					}
				}
			}
			
			// Listen for play/pause events
			heroVideo.addEventListener('play', updateHeroPlayIcon);
			heroVideo.addEventListener('pause', updateHeroPlayIcon);
			heroVideo.addEventListener('ended', updateHeroPlayIcon);
			
			// Initial state
			updateHeroPlayIcon();
			
			// Make hero play icon clickable
			if (heroBackground) {
				heroBackground.addEventListener('click', function(e) {
					// If video is paused, clicking anywhere on hero background (including play icon) should play
					if (heroBackground.classList.contains('hero-video-paused') && heroVideo.paused) {
						e.preventDefault();
						e.stopPropagation();
						heroVideo.play();
					}
				});
			}
			
			heroVideo.play().catch(function() {
				// Ignore autoplay restrictions, will play on user interaction
			});
			
			// Ensure hero video keeps playing
			heroVideo.addEventListener('pause', function() {
				if (document.visibilityState === 'visible') {
					heroVideo.play().catch(function() {});
				}
			});
			
			// Play when page becomes visible
			document.addEventListener('visibilitychange', function() {
				if (document.visibilityState === 'visible' && heroVideo.paused) {
					heroVideo.play().catch(function() {});
				}
			});
		}
		
		
		// Feature videos - play on hover, but only if slide is active
		const featureBlocks = document.querySelectorAll('.feature-block');
		featureBlocks.forEach(function(featureBlock) {
			const video = featureBlock.querySelector('video');
			const wrapper = featureBlock.querySelector('.video-controls-wrapper');
			
			if (!video) return;
			
			// Update play icon visibility based on video state
			function updatePlayIcon() {
				if (wrapper) {
					if (video.paused) {
						wrapper.classList.add('video-paused');
					} else {
						wrapper.classList.remove('video-paused');
					}
				}
			}
			
			// Listen for play/pause events
			video.addEventListener('play', updatePlayIcon);
			video.addEventListener('pause', updatePlayIcon);
			video.addEventListener('ended', updatePlayIcon);
			
			// Initial state - videos start paused
			video.pause();
			updatePlayIcon();
			
			// Helper function to check if the slide is active
			function isSlideActive() {
				const slide = featureBlock.closest('.carousel-slide');
				return slide && slide.classList.contains('active');
			}
			
			// Play on hover, but only if the slide is active
			featureBlock.addEventListener('mouseenter', function() {
				if (isSlideActive()) {
					video.play().catch(function() {
						// Ignore autoplay restrictions
					});
					// Mark that video was playing
					const slide = featureBlock.closest('.carousel-slide');
					if (slide) {
						slide.dataset.videoWasPlaying = 'true';
					}
				}
			});
			
			// Pause when mouse leaves (for inactive slides that might have been playing)
			featureBlock.addEventListener('mouseleave', function() {
				if (!isSlideActive() && !video.paused) {
					video.pause();
					const slide = featureBlock.closest('.carousel-slide');
					if (slide) {
						slide.dataset.videoWasPlaying = 'false';
					}
				}
			});
		});

		// Parallax effect - Removed to prevent conflict with entrance animations
		/* 
		const featureBlocks = document.querySelectorAll('.feature-block');
		let ticking = false;
		
		function updateParallax() {
			...
		}
		window.addEventListener('scroll', updateParallax, { passive: true });
		*/
	}
	
	setupFeatureInteractions();

	// Custom Video Controls with Progress Bar (only for feature videos)
	function setupVideoControls() {
		const videoWrappers = document.querySelectorAll('.feature-media .video-controls-wrapper');
		
		videoWrappers.forEach(function(wrapper) {
			const video = wrapper.querySelector('video');
			const progressBar = wrapper.querySelector('.video-progress-bar');
			const progressFilled = wrapper.querySelector('.video-progress-filled');
			const progressHandle = wrapper.querySelector('.video-progress-handle');
			
			if (!video || !progressBar || !progressFilled || !progressHandle) return;
			
			// Disable default controls to prevent dimming
			video.controls = false;
			video.setAttribute('controls', 'false');
			
			let isDragging = false;
			let wasPlaying = false;
			
			// Update progress bar
			function updateProgress(forceProgress) {
				// Don't update if dragging (unless forced)
				if (isDragging && forceProgress === undefined) return;
				
				// Check if video duration is available
				if (!video.duration || !isFinite(video.duration) || video.duration === 0) {
					return;
				}
				
				let progress;
				if (forceProgress !== undefined) {
					progress = forceProgress;
				} else {
					progress = (video.currentTime / video.duration) * 100;
				}
				
				if (isNaN(progress) || !isFinite(progress)) return;
				
				// Clamp progress between 0 and 100
				progress = Math.max(0, Math.min(100, progress));
				
				progressFilled.style.width = progress + '%';
				progressHandle.style.left = progress + '%';
			}
			
			// Click on wrapper to handle play icon clicks (when video is paused)
			wrapper.addEventListener('click', function(e) {
				// Don't handle if clicking on controls
				if (e.target.closest('.video-controls')) return;
				
				// If video is paused, clicking anywhere on wrapper (including play icon) should play
				if (wrapper.classList.contains('video-paused') && video.paused) {
					e.preventDefault();
					e.stopPropagation();
					video.play();
					return;
				}
			});
			
			// Click on video to pause/play (but not on controls)
			video.addEventListener('click', function(e) {
				// Don't toggle if clicking on controls
				if (e.target.closest('.video-controls')) return;
				
				// Don't toggle if clicking on play icon overlay (handled by wrapper)
				if (wrapper && wrapper.classList.contains('video-paused')) {
					return; // Let wrapper handler take care of it
				}
				
				if (video.paused) {
					video.play();
				} else {
					video.pause();
				}
			});
			
			// Progress bar click/drag
			function seekTo(e) {
				const rect = progressBar.getBoundingClientRect();
				const pos = (e.clientX - rect.left) / rect.width;
				const newTime = pos * video.duration;
				
				if (!isNaN(newTime) && isFinite(newTime)) {
					const clampedTime = Math.max(0, Math.min(newTime, video.duration));
					video.currentTime = clampedTime;
					// Manually update progress for smooth dragging
					const progressPercent = (clampedTime / video.duration) * 100;
					updateProgress(progressPercent);
				}
			}
			
			// Seek function for both click and drag
			function startSeek(e) {
				if (e.preventDefault) {
					e.preventDefault();
				}
				isDragging = true;
				wrapper.classList.add('dragging');
				wasPlaying = !video.paused;
				if (wasPlaying) {
					video.pause();
				}
				seekTo(e);
			}
			
			// Click on progress bar
			progressBar.addEventListener('click', function(e) {
				if (!isDragging) {
					seekTo(e);
				}
			});
			
			// Drag functionality - allow dragging anywhere on progress bar
			progressBar.addEventListener('mousedown', function(e) {
				startSeek(e);
			});
			
			// Also allow dragging via handle
			progressHandle.addEventListener('mousedown', function(e) {
				startSeek(e);
			});
			
			document.addEventListener('mousemove', function(e) {
				if (isDragging) {
					seekTo(e);
				}
			});
			
			document.addEventListener('mouseup', function() {
				if (isDragging) {
					isDragging = false;
					wrapper.classList.remove('dragging');
					if (wasPlaying) {
						video.play();
					}
				}
			});
			
			// Touch support for mobile - allow dragging anywhere on progress bar
			progressBar.addEventListener('touchstart', function(e) {
				e.preventDefault();
				if (e.touches.length > 0) {
					const touch = e.touches[0];
					// Create a synthetic event object for seekTo
					const syntheticEvent = {
						clientX: touch.clientX,
						preventDefault: function() {}
					};
					startSeek(syntheticEvent);
				}
			});
			
			// Also allow dragging via handle
			progressHandle.addEventListener('touchstart', function(e) {
				e.preventDefault();
				if (e.touches.length > 0) {
					const touch = e.touches[0];
					const syntheticEvent = {
						clientX: touch.clientX,
						preventDefault: function() {}
					};
					startSeek(syntheticEvent);
				}
			});
			
			document.addEventListener('touchmove', function(e) {
				if (isDragging && e.touches.length > 0) {
					const touch = e.touches[0];
					const rect = progressBar.getBoundingClientRect();
					const pos = (touch.clientX - rect.left) / rect.width;
					const newTime = pos * video.duration;
					
					if (!isNaN(newTime) && isFinite(newTime)) {
						const clampedTime = Math.max(0, Math.min(newTime, video.duration));
						video.currentTime = clampedTime;
						const progressPercent = (clampedTime / video.duration) * 100;
						updateProgress(progressPercent);
					}
				}
			});
			
			document.addEventListener('touchend', function() {
				if (isDragging) {
					isDragging = false;
					wrapper.classList.remove('dragging');
					if (wasPlaying) {
						video.play();
					}
				}
			});
			
			// Update progress on timeupdate - use named function to ensure it's attached
			function handleTimeUpdate() {
				updateProgress();
			}
			
			video.addEventListener('timeupdate', handleTimeUpdate);
			video.addEventListener('loadedmetadata', function() {
				updateProgress();
			});
			video.addEventListener('loadeddata', function() {
				updateProgress();
			});
			video.addEventListener('canplay', function() {
				updateProgress();
			});
			
			// Initial state - wait a bit for video to load
			setTimeout(function() {
				updateProgress();
			}, 100);
			
			// Fallback: periodic update check in case timeupdate doesn't fire
			const progressInterval = setInterval(function() {
				if (!video.paused && !isDragging) {
					updateProgress();
				}
			}, 100); // Update every 100ms as fallback
			
			// Clean up interval when video is removed
			video.addEventListener('removed', function() {
				clearInterval(progressInterval);
			});
			
			// Show controls on hover
			wrapper.addEventListener('mouseenter', function() {
				wrapper.classList.add('controls-visible');
			});
			
			wrapper.addEventListener('mouseleave', function() {
				if (!isDragging) {
					wrapper.classList.remove('controls-visible');
				}
			});
		});
	}
	
	setupVideoControls();
	// Optional: open modal for Privacy/Terms
	function simpleModal(id, title, contentHtml) {
		const existing = document.getElementById(id);
		if (existing) existing.remove();
		const wrapper = document.createElement('div');
		wrapper.id = id;
		wrapper.innerHTML = `
			<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:grid;place-items:center;z-index:1000;">
				<div style="max-width:720px;width:92%;background:#111833;border:1px solid #1f2937;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.5);">
					<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #1f2937;">
						<strong>${title}</strong>
						<button id="${id}-close" class="btn btn-secondary" style="padding:6px 10px;">Close</button>
					</div>
					<div style="padding:16px;max-height:70vh;overflow:auto;color:#e5e7eb;">
						${contentHtml}
					</div>
				</div>
			</div>`;
		document.body.appendChild(wrapper);
		document.getElementById(`${id}-close`).addEventListener('click', function() {
			wrapper.remove();
		});
	}

	const privacyLink = document.getElementById('privacyLink');
	if (privacyLink) {
		privacyLink.addEventListener('click', function(e) {
			e.preventDefault();
			simpleModal('privacy-modal', 'Privacy Policy', '<p>Add your privacy policy.</p>');
		});
	}

	const termsLink = document.getElementById('termsLink');
	if (termsLink) {
		termsLink.addEventListener('click', function(e) {
			e.preventDefault();
			simpleModal('terms-modal', 'Terms of Use', '<p>Add your terms.</p>');
		});
	}

	// Licensing: trial start, activation, status check
	const apiBase = (document.body && document.body.dataset.apiBase) || '';
	const licenseStatusEl = document.getElementById('licenseStatus');
	const licenseDetailEl = document.getElementById('licenseDetail');
	const trialMessage = document.getElementById('trialMessage');
	const licenseMessage = document.getElementById('licenseMessage');
	const paypalContainer = document.getElementById('paypal-button-container');
	const trialUserLine = document.getElementById('trialUserLine');
	const licenseUserLine = document.getElementById('licenseUserLine');

	function setText(el, text) {
		if (el) el.textContent = text || '';
	}

	function setBadge(status, detail) {
		if (!licenseStatusEl || !licenseDetailEl) return;
		licenseStatusEl.classList.remove('is-active', 'is-trial', 'is-expired');
		let label = 'Status: unknown';
		if (status === 'active') {
			label = 'Status: Active';
			licenseStatusEl.classList.add('is-active');
		} else if (status === 'trial') {
			label = 'Status: Trial';
			licenseStatusEl.classList.add('is-trial');
		} else if (status === 'expired') {
			label = 'Status: Expired';
			licenseStatusEl.classList.add('is-expired');
		} else if (status === 'inactive') {
			label = 'Status: Inactive';
		}
		licenseStatusEl.textContent = label;
		licenseDetailEl.textContent = detail || 'Start a trial or check a license to see status.';
	}

	function getSignedInEmail() {
		return currentUser?.email || '';
	}

	function updateLicenseUserText(user) {
		const email = user?.email || '';
		if (trialUserLine) {
			trialUserLine.textContent = email
				? `Signed in as ${email}`
				: 'Sign in to link the trial to your account.';
		}
		if (licenseUserLine) {
			licenseUserLine.textContent = email
				? `Signed in as ${email}`
				: 'Sign in to check or activate your access.';
		}
	}

	function requireUserEmail(messageEl) {
		const email = getSignedInEmail();
		if (email) return email;
		if (messageEl) setText(messageEl, 'Sign in with Google or email to continue.');
		setBadge('inactive', 'Sign in to manage your license.');
		openAuthModal();
		return null;
	}

	function prettyExpiry(ts) {
		if (!ts) return '';
		const date = new Date(ts);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleString();
	}

	async function postJson(path, payload) {
		try {
			const resp = await fetch((apiBase || '') + path, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload || {})
			});
			let data = {};
			try { data = await resp.json(); } catch (err) { /* ignore */ }
			if (!resp.ok) {
				const errMsg = data && (data.error || data.reason);
				throw new Error(errMsg || `Request failed with status ${resp.status}`);
			}
			return data;
		} catch (err) {
			// Re-throw with more context if it's a network error
			if (err instanceof TypeError && err.message.includes('fetch')) {
				throw new Error('Failed to connect to server. Make sure the server is running or check your network connection.');
			}
			throw err;
		}
	}

	async function refreshLicenseStatus(options) {
		const targetMessage = options && options.targetMessage ? options.targetMessage : licenseMessage;
		const email = requireUserEmail(targetMessage);
		if (!email) return;

		try {
			const res = await postJson('/api/license/verify', { email });
			const expiry = prettyExpiry(res.expiresAt);
			let detail = '';
			if (res.status === 'active') {
				detail = expiry ? `License active · Expires ${expiry}` : 'License active.';
			} else if (res.status === 'trial') {
				detail = expiry ? `Trial active until ${expiry}.` : 'Trial active.';
			} else if (res.status === 'expired') {
				detail = expiry ? `Trial expired on ${expiry}.` : 'Trial expired.';
			} else {
				detail = res.reason || 'No active license or trial.';
			}
			setText(targetMessage, detail);
			setBadge(res.status, detail);
		} catch (err) {
			const msg = err.message || 'Unable to verify.';
			setText(targetMessage, msg);
			setBadge('inactive', msg);
		}
	}

	function wireLicensingForms() {
		const trialForm = document.getElementById('trialForm');
		const trialSubmit = document.getElementById('trialSubmit');
		if (trialForm && trialSubmit) {
			trialForm.addEventListener('submit', async function(e) {
				e.preventDefault();
				const email = requireUserEmail(trialMessage);
				if (!email) return;
				trialSubmit.disabled = true;
				trialSubmit.textContent = 'Working...';
				setText(trialMessage, '');
				try {
					const res = await postJson('/api/trial/start', { email });
					const expiry = prettyExpiry(res.expiresAt);
					setText(trialMessage, res.message + (expiry ? ` · Expires: ${expiry}` : ''));
					setBadge(res.status, expiry ? `Expires on ${expiry}` : 'Trial created.');
					// Refresh status panel
					refreshLicenseStatus({ targetMessage: licenseMessage });
				} catch (err) {
					const msg = err.message || 'Unable to start trial.';
					setText(trialMessage, msg);
					setBadge('inactive', msg);
				} finally {
					trialSubmit.disabled = false;
					trialSubmit.textContent = 'Start trial';
				}
			});
		}

		const licenseForm = document.getElementById('licenseForm');
		const licenseSubmit = document.getElementById('licenseSubmit');

		async function handleVerify() {
			await refreshLicenseStatus({ targetMessage: licenseMessage });
		}

		if (licenseForm && licenseSubmit) {
			licenseForm.addEventListener('submit', async function(e) {
				e.preventDefault();
				licenseSubmit.disabled = true;
				licenseSubmit.textContent = 'Checking...';
				setText(licenseMessage, '');
				try {
					await handleVerify();
				} catch (err) {
					const msg = err.message || 'Unable to activate.';
					setText(licenseMessage, msg);
					setBadge('inactive', msg);
				} finally {
					licenseSubmit.disabled = false;
					licenseSubmit.textContent = 'Check status';
				}
			});
		}
	}

	wireLicensingForms();

	// Test Email Form Handler
	function wireTestEmailForm() {
		const testEmailForm = document.getElementById('testEmailForm');
		const testEmailInput = document.getElementById('testEmailInput');
		const testEmailSubmit = document.getElementById('testEmailSubmit');
		const testEmailMessage = document.getElementById('testEmailMessage');

		if (testEmailForm && testEmailInput && testEmailSubmit && testEmailMessage) {
			testEmailForm.addEventListener('submit', async function(e) {
				e.preventDefault();
				const email = (testEmailInput.value || '').trim();
				if (!email) {
					setText(testEmailMessage, 'Please enter an email address.');
					return;
				}
				testEmailSubmit.disabled = true;
				testEmailSubmit.textContent = 'Sending...';
				setText(testEmailMessage, '');
				try {
					const res = await postJson('/api/test/email', { email, name: 'Test User' });
					if (res.ok) {
						if (res.emailSent) {
							const detailsMsg = res.emailDetails ? ` (Email ID: ${res.emailDetails.id})` : '';
							setText(testEmailMessage, `✅ Test email sent successfully to ${email}!${detailsMsg} Check your inbox (and spam folder). License key: ${res.licenseKey}`);
							showInfo(`Test email sent to ${email}. Check spam folder if not received.`);
						} else {
							const errorMsg = res.emailError || 'Unknown error';
							setText(testEmailMessage, `⚠️ Email not sent: ${errorMsg}. License key generated: ${res.licenseKey}`);
							showError(`Email sending failed: ${errorMsg}`);
						}
					} else {
						setText(testEmailMessage, `❌ ${res.error || 'Failed to send test email'}`);
						showError(res.error || 'Failed to send test email');
					}
				} catch (err) {
					console.error('Test email error:', err);
					let msg = err.message || 'Unable to send test email.';
					// Provide more helpful error messages
					if (msg.includes('Failed to connect') || msg.includes('Failed to fetch') || msg.includes('NetworkError') || err instanceof TypeError) {
						msg = 'Failed to connect to server. If testing locally, run "vercel dev" in your terminal. If deployed, make sure the endpoint is deployed.';
					}
					setText(testEmailMessage, `❌ ${msg}`);
					showError(msg);
				} finally {
					testEmailSubmit.disabled = false;
					testEmailSubmit.textContent = 'Send Test Email';
				}
			});
		}
	}

	wireTestEmailForm();

	// Helper Functions for UI
	function showLoadingState() {
		let overlay = document.getElementById('payment-loading-overlay');
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.id = 'payment-loading-overlay';
			overlay.innerHTML = `
				<div class="loading-backdrop"></div>
				<div class="loading-panel">
					<div class="spinner"></div>
					<p>Processing payment...</p>
				</div>
			`;
			document.body.appendChild(overlay);
		}
		overlay.style.display = 'block';
	}

	function hideLoadingState() {
		const overlay = document.getElementById('payment-loading-overlay');
		if (overlay) {
			overlay.style.display = 'none';
		}
	}

	function showError(message) {
		const notification = document.createElement('div');
		notification.className = 'error-notification';
		notification.innerHTML = `
			<div class="notification-content">
				<span class="error-icon">❌</span>
				<span class="error-message">${message}</span>
				<button class="close-notification" onclick="this.parentElement.parentElement.remove()">×</button>
			</div>
		`;
		document.body.appendChild(notification);
		
		// Animate in
		setTimeout(() => {
			notification.style.transform = 'translateX(0)';
		}, 100);
		
		// Auto remove after 5 seconds
		setTimeout(() => {
			if (notification.parentElement) {
				notification.style.transform = 'translateX(100%)';
				setTimeout(() => {
					if (notification.parentElement) {
						notification.remove();
					}
				}, 300);
			}
		}, 5000);
	}

	function showInfo(message) {
		const notification = document.createElement('div');
		notification.className = 'info-notification';
		notification.innerHTML = `
			<div class="notification-content">
				<span class="info-icon">ℹ️</span>
				<span class="info-message">${message}</span>
				<button class="close-notification" onclick="this.parentElement.parentElement.remove()">×</button>
			</div>
		`;
		document.body.appendChild(notification);
		
		// Animate in
		setTimeout(() => {
			notification.style.transform = 'translateX(0)';
		}, 100);
		
		// Auto remove after 3 seconds
		setTimeout(() => {
			if (notification.parentElement) {
				notification.style.transform = 'translateX(100%)';
				setTimeout(() => {
					if (notification.parentElement) {
						notification.remove();
					}
				}, 300);
			}
		}, 3000);
	}

	function showSuccessModal(email, licenseKey) {
		const modal = document.getElementById('success-modal');
		const licenseKeyText = document.getElementById('license-key-text');
		const copyBtn = document.getElementById('copy-license-btn');
		const licenseInfoDiv = document.querySelector('.license-info');
		
		// Show the license key if provided; otherwise indicate email delivery
		if (licenseKeyText) {
			if (licenseKey) {
				licenseKeyText.textContent = licenseKey;
			} else if (email) {
				licenseKeyText.textContent = `Sent to ${email}`;
			} else {
				licenseKeyText.textContent = 'License will be emailed shortly.';
			}
		}
		
		if (copyBtn) {
			if (licenseKey) {
				copyBtn.style.display = 'inline-flex';
				copyBtn.onclick = function() {
					navigator.clipboard.writeText(licenseKey).then(() => {
						copyBtn.textContent = 'Copied!';
						setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
					});
				};
			} else {
				copyBtn.style.display = 'none';
			}
		}
		
		// Close modal button
		const closeBtn = document.getElementById('close-modal-btn');
		if (closeBtn) {
			closeBtn.addEventListener('click', function() {
				modal.style.display = 'none';
				modal.classList.remove('active');
			});
		}
		
		// Show modal
		modal.style.display = 'flex';
		// Small timeout to allow display:flex to apply before adding active class for opacity transition
		setTimeout(() => {
			modal.classList.add('active');
		}, 10);
	}

	function applyPayPalDarkModeFixes() {
		// Check if dark mode is active (always true for this site theme)
		const isDarkMode = true;
		
		if (!isDarkMode) return;
		
		// Function to style PayPal text elements
		const stylePayPalText = () => {
			const container = document.getElementById('paypal-button-container');
			if (!container) return;
			
			// Style all text elements within the PayPal container
			const textElements = container.querySelectorAll('label, span, p, div, a, li');
			textElements.forEach(el => {
				const computedStyle = window.getComputedStyle(el);
				const textColor = computedStyle.color;
				
				// Check if text is likely hard to read (dark text colors)
				if (textColor) {
					if (textColor.includes('#1f2937') || 
					    textColor.includes('#374151') ||
					    textColor.includes('#4b5563') ||
					    textColor.includes('#6b7280') ||
					    textColor.includes('rgb(31, 41, 55)')) {
						el.style.color = '#e2e8f0';
					}
				}
			});
			
			// Also check for common PayPal text patterns
			const allElements = container.querySelectorAll('*');
			allElements.forEach(el => {
				const text = el.textContent || '';
				if (text.includes('Ship to billing address') || 
					text.includes("you're 18 years or older") ||
					text.includes('By continuing')) {
					el.style.color = '#e2e8f0';
				}
			});
		};
		
		// Apply styles immediately
		stylePayPalText();
		
		// Use MutationObserver to watch for dynamically added PayPal elements
		const observer = new MutationObserver(function(mutations) {
			stylePayPalText();
		});
		
		const container = document.getElementById('paypal-button-container');
		if (container) {
			observer.observe(container, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['style', 'class']
			});
		}
	}

	async function sendPaymentToBackend({ orderId, details }) {
		const payload = {
			orderId: orderId || details?.id,
			status: details?.status,
			payerEmail: details?.payer?.email_address,
			payerName: details?.payer?.name ? `${details.payer.name.given_name || ''} ${details.payer.name.surname || ''}`.trim() : '',
			purchase_units: details?.purchase_units,
			amount: details?.purchase_units?.[0]?.amount?.value,
			currency: details?.purchase_units?.[0]?.amount?.currency_code
		};

		const resp = await fetch('/api/paypal/webhook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		let json = {};
		try { json = await resp.json(); } catch (_) { /* ignore */ }

		if (!resp.ok || !json.ok) {
			throw new Error(json.error || 'Webhook call failed');
		}
		return json;
	}

	// PayPal Smart Buttons
	function setupPayPalButtons() {
		if (!paypalContainer) return;
		if (typeof paypal === 'undefined' || !paypal.Buttons) return;

		paypal.Buttons({
			style: {
				layout: 'vertical',
				color: 'blue',
				shape: 'rect',
				label: 'paypal'
			},
			createOrder: function(data, actions) {
				const email = getSignedInEmail();
				if (!email) {
					showError('Please sign in before purchasing so we can link your license.');
					openAuthModal();
					return Promise.reject(new Error('Sign-in required'));
				}
				return actions.order.create({
					purchase_units: [{
						amount: { value: '19.00', currency_code: 'USD' },
						custom_id: email,
						description: 'Vertical FX List for REAPER - Lifetime License'
					}]
				});
			},
			onApprove: function(data, actions) {
				showLoadingState();
				
				return actions.order.capture().then(async function(details) {
					console.log('Payment completed:', details);
					
					const customerEmail = details.payer?.email_address;
					const msg = 'Payment captured via PayPal. Your license will be issued via email.';
					setText(licenseMessage, msg);
					setBadge('active', msg);
					
					// Send to backend to issue license and email
					let backendResponse = null;
					try {
						backendResponse = await sendPaymentToBackend({ orderId: data.orderID, details });
					} catch (err) {
						console.error('Backend license issuance failed:', err);
						showError('Payment captured, but license delivery failed. We will follow up via email.');
					}

					hideLoadingState();
					showSuccessModal(customerEmail, backendResponse && backendResponse.licenseKey);
					refreshLicenseStatus({ targetMessage: licenseMessage });
					
				}).catch(function(error) {
					console.error('Payment capture error:', error);
					showError('Payment processing failed. Please try again.');
					hideLoadingState();
				});
			},
			onError: function(err) {
				console.error('PayPal error:', err);
				showError('Payment failed. Please try again.');
				hideLoadingState();
			},
			onCancel: function(data) {
				showInfo('Payment was cancelled. You can try again anytime.');
			}
		}).render(paypalContainer);
		
		// Apply dark mode fixes
		setTimeout(applyPayPalDarkModeFixes, 1000);
	}

	// Attempt to initialize PayPal buttons once SDK is available
	if (paypalContainer) {
		if (typeof paypal !== 'undefined') {
			setupPayPalButtons();
		} else {
			const readyCheck = setInterval(function() {
				if (typeof paypal !== 'undefined') {
					clearInterval(readyCheck);
					setupPayPalButtons();
				}
			}, 200);
			// Safety timeout to stop polling after 10 seconds
			setTimeout(function() {
				clearInterval(readyCheck);
				if (typeof paypal === 'undefined') {
					setText(paypalContainer, 'PayPal failed to load. Please try again or use the standard Buy button.');
				}
			}, 10000);
		}
	}
})();

// Generic Carousel Functionality
(function() {
	function initCarousels() {
		const carousels = document.querySelectorAll('.carousel-wrapper');
		
		carousels.forEach(carousel => {
			const track = carousel.querySelector('.carousel-track');
			const slides = carousel.querySelectorAll('.carousel-slide');
			const prevBtn = carousel.querySelector('.carousel-prev');
			const nextBtn = carousel.querySelector('.carousel-next');
			const dots = carousel.querySelectorAll('.carousel-dot');

			if (!track || !prevBtn || !nextBtn) return;
			
			// Preload all carousel content immediately
			slides.forEach(function(slide) {
				// Ensure slide is visible (bypass lazy loading)
				slide.classList.add('visible');
				
				// Preload all videos
				const videos = slide.querySelectorAll('video');
				videos.forEach(function(video) {
					video.load(); // Force load metadata
					video.preload = 'auto'; // Ensure preloading
					// Set initial play state
					const slideEl = video.closest('.carousel-slide');
					if (slideEl) {
						slideEl.dataset.videoWasPlaying = 'false';
					}
				});
			});
			
			let currentSlide = 0;

			function updateActiveState() {
				// Find center point of the view
				const trackCenter = track.scrollLeft + track.clientWidth / 2;
				
				let minDistance = Infinity;
				let newActiveIndex = 0;

				slides.forEach((slide, index) => {
					// Slide center relative to track start
					const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
					const dist = Math.abs(trackCenter - slideCenter);
					
					if (dist < minDistance) {
						minDistance = dist;
						newActiveIndex = index;
					}
				});

				currentSlide = newActiveIndex;

				// Update dots
				dots.forEach((dot, index) => {
					dot.classList.toggle('active', index === currentSlide);
				});

				// Update active slide class for blur effect AND video control
				slides.forEach((slide, index) => {
					const isActive = index === currentSlide;
					const video = slide.querySelector('video');
					
					if (isActive) {
						slide.classList.add('active');
						// Resume video if it was playing before (stored in data attribute)
						if (video) {
							const wasPlaying = slide.dataset.videoWasPlaying === 'true';
							if (wasPlaying && video.paused) {
								video.play().catch(() => {});
							}
						}
					} else {
						slide.classList.remove('active');
						// Pause all videos in inactive slides for performance
						// Store play state so we can resume later
						if (video && !video.paused) {
							slide.dataset.videoWasPlaying = 'true';
							video.pause();
						} else if (video) {
							slide.dataset.videoWasPlaying = 'false';
						}
					}
				});
			}

			function scrollToSlide(slideIndex) {
				const slide = slides[slideIndex];
				if (!slide) return;

				// Center the target slide
				// position = slide.offsetLeft - (viewport/2 - slide/2)
				const targetScroll = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
				
				track.scrollTo({
					left: targetScroll,
					behavior: 'smooth'
				});
			}

			function scrollLeft() {
				// Move to previous slide
				const targetIndex = Math.max(0, currentSlide - 1);
				scrollToSlide(targetIndex);
			}

			function scrollRight() {
				// Move to next slide
				const targetIndex = Math.min(slides.length - 1, currentSlide + 1);
				scrollToSlide(targetIndex);
			}

			// Update arrow states based on scroll position
			function updateArrowStates() {
				// Allow small tolerance
				const tolerance = 10;
				
				// Check start
				prevBtn.disabled = currentSlide === 0;
				
				// Check end
				nextBtn.disabled = currentSlide === slides.length - 1;
			}

			// Event listeners
			nextBtn.addEventListener('click', scrollRight);
			prevBtn.addEventListener('click', scrollLeft);

			dots.forEach((dot, index) => {
				dot.addEventListener('click', () => scrollToSlide(index));
			});

			// Scroll event listener
			// Use debounce/throttle or requestAnimationFrame for performance if needed,
			// but for simple active state updates, standard scroll listener is usually fine
			let isScrolling = false;
			track.addEventListener('scroll', () => {
				if (!isScrolling) {
					window.requestAnimationFrame(() => {
						updateActiveState();
						updateArrowStates();
						isScrolling = false;
					});
					isScrolling = true;
				}
			});
			
			// Resize observer
			if (window.ResizeObserver) {
				new ResizeObserver(() => {
					updateActiveState();
					updateArrowStates();
				}).observe(track);
			}

			// Initialize states
			setTimeout(() => {
				updateActiveState();
				updateArrowStates();
			}, 100);
		});
	}

	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initCarousels);
	} else {
		initCarousels();
	}
})();

