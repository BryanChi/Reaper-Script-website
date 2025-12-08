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

	// Set current year in footer
	const yearEl = document.getElementById('year');
	if (yearEl) yearEl.textContent = String(new Date().getFullYear());

	// Handle Buy buttons via Payment Link (Stripe, Lemon Squeezy, Paddle, etc.)
	function wireBuyButtons() {
		const buttons = [
			document.getElementById('buyButton'),
			document.getElementById('buyButtonPricing'),
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
		if (!('IntersectionObserver' in window)) {
			els.forEach(function(el) { el.classList.add('visible'); });
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
		
		els.forEach(function(el) { io.observe(el); });
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
					if (heroBackground.classList.contains('hero-video-paused') && heroVideo.paused) {
						const rect = heroBackground.getBoundingClientRect();
						const centerX = rect.left + rect.width / 2;
						const centerY = rect.top + rect.height / 2;
						const clickX = e.clientX;
						const clickY = e.clientY;
						const distance = Math.sqrt(Math.pow(clickX - centerX, 2) + Math.pow(clickY - centerY, 2));
						
						// If click is near center (within 60px radius), play video
						if (distance < 60) {
							e.preventDefault();
							e.stopPropagation();
							heroVideo.play();
						}
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
		
		
		// Feature videos - play on hover, continue playing when hover ends
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
			
			// Play on hover
			featureBlock.addEventListener('mouseenter', function() {
				video.play().catch(function() {
					// Ignore autoplay restrictions
				});
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
			
			// Click on video to pause/play (but not on controls)
			video.addEventListener('click', function(e) {
				// Don't toggle if clicking on controls
				if (e.target.closest('.video-controls')) return;
				
				// Don't toggle if clicking on play icon overlay (handled separately)
				if (wrapper && wrapper.classList.contains('video-paused')) {
					const rect = wrapper.getBoundingClientRect();
					const centerX = rect.left + rect.width / 2;
					const centerY = rect.top + rect.height / 2;
					const clickX = e.clientX;
					const clickY = e.clientY;
					const distance = Math.sqrt(Math.pow(clickX - centerX, 2) + Math.pow(clickY - centerY, 2));
					
					// If click is near center (within 50px radius), play video
					if (distance < 50) {
						video.play();
						return;
					}
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

	// Simple in-page editing
	var editEnabled = false;
	var toggleBtn = document.getElementById('editToggle');
	var saveBtn = document.getElementById('saveFile');
	var editableRoot = document.querySelector('[data-editable]');

	function setEditable(enabled) {
		if (!editableRoot) return;
		editEnabled = enabled;
		editableRoot.contentEditable = enabled ? 'true' : 'false';
		toggleBtn && (toggleBtn.textContent = enabled ? 'Stop Edit' : 'Edit');
	}

	if (toggleBtn) {
		toggleBtn.addEventListener('click', function() {
			setEditable(!editEnabled);
		});
	}

	var fileHandle = null;
	if (saveBtn) {
		saveBtn.addEventListener('click', async function() {
			if (!editableRoot) return;
			// Prefer File System Access API when available (Chrome/Edge)
			if (window.showSaveFilePicker) {
				try {
					if (!fileHandle) {
						fileHandle = await window.showSaveFilePicker({
							suggestedName: 'index.html',
							types: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }]
						});
					}
					const writable = await fileHandle.createWritable();
					await writable.write(document.documentElement.outerHTML);
					await writable.close();
					saveBtn.textContent = 'Saved';
					setTimeout(function(){ saveBtn.textContent = 'Save'; }, 1200);
					return;
				} catch (err) {
					// fall back to download
				}
			}
			var blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
			var a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = 'index.html';
			a.click();
			URL.revokeObjectURL(a.href);
		});
	}

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

	function prettyExpiry(ts) {
		if (!ts) return '';
		const date = new Date(ts);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleString();
	}

	async function postJson(path, payload) {
		const resp = await fetch((apiBase || '') + path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload || {})
		});
		let data = {};
		try { data = await resp.json(); } catch (err) { /* ignore */ }
		if (!resp.ok) {
			const errMsg = data && (data.error || data.reason);
			throw new Error(errMsg || 'Request failed');
		}
		return data;
	}

	function wireLicensingForms() {
		const trialForm = document.getElementById('trialForm');
		const trialEmail = document.getElementById('trialEmail');
		const trialSubmit = document.getElementById('trialSubmit');

		if (trialForm && trialEmail && trialSubmit) {
			trialForm.addEventListener('submit', async function(e) {
				e.preventDefault();
				const email = (trialEmail.value || '').trim();
				if (!email) return;
				trialSubmit.disabled = true;
				trialSubmit.textContent = 'Working...';
				setText(trialMessage, '');
				try {
					const res = await postJson('/api/trial/start', { email });
					const expiry = prettyExpiry(res.expiresAt);
					setText(trialMessage, res.message + (expiry ? ` · Expires: ${expiry}` : ''));
					setBadge(res.status, expiry ? `Expires on ${expiry}` : 'Trial created.');
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
		const licenseEmail = document.getElementById('licenseEmail');
		const licenseKey = document.getElementById('licenseKey');
		const licenseSubmit = document.getElementById('licenseSubmit');
		const licenseCheck = document.getElementById('licenseCheck');

		async function handleVerify(includeKey) {
			const email = (licenseEmail && licenseEmail.value || '').trim();
			const key = (licenseKey && licenseKey.value || '').trim();
			if (!email) {
				setText(licenseMessage, 'Email is required.');
				return;
			}
			try {
				const res = await postJson('/api/license/verify', { email, licenseKey: includeKey ? key : undefined });
				const expiry = prettyExpiry(res.expiresAt);
				let detail = '';
				if (res.status === 'active') {
					detail = 'License active.';
				} else if (res.status === 'trial') {
					detail = expiry ? `Trial active until ${expiry}.` : 'Trial active.';
				} else if (res.status === 'expired') {
					detail = expiry ? `Trial expired on ${expiry}.` : 'Trial expired.';
				} else {
					detail = res.reason || 'No active license or trial.';
				}
				setText(licenseMessage, detail);
				setBadge(res.status, detail);
			} catch (err) {
				const msg = err.message || 'Unable to verify.';
				setText(licenseMessage, msg);
				setBadge('inactive', msg);
			}
		}

		if (licenseForm && licenseEmail && licenseKey && licenseSubmit) {
			licenseForm.addEventListener('submit', async function(e) {
				e.preventDefault();
				const email = (licenseEmail.value || '').trim();
				const key = (licenseKey.value || '').trim();
				if (!email || !key) {
					setText(licenseMessage, 'Email and license key are required.');
					return;
				}
				licenseSubmit.disabled = true;
				licenseSubmit.textContent = 'Activating...';
				setText(licenseMessage, '');
				try {
					const res = await postJson('/api/license/activate', { email, licenseKey: key });
					const expiry = prettyExpiry(res.expiresAt);
					const msg = `License activated${expiry ? ` · Expires ${expiry}` : ''}.`;
					setText(licenseMessage, msg);
					setBadge('active', msg);
				} catch (err) {
					const msg = err.message || 'Unable to activate.';
					setText(licenseMessage, msg);
					setBadge('inactive', msg);
				} finally {
					licenseSubmit.disabled = false;
					licenseSubmit.textContent = 'Activate';
				}
			});
		}

		if (licenseCheck) {
			licenseCheck.addEventListener('click', function() {
				handleVerify(true);
			});
		}
	}

	wireLicensingForms();

	// PayPal Smart Buttons
	function setupPayPalButtons() {
		if (!paypalContainer) return;
		if (typeof paypal === 'undefined' || !paypal.Buttons) return;

		paypal.Buttons({
			style: {
				shape: 'rect',
				color: 'gold',
				layout: 'vertical',
				label: 'paypal'
			},
			createOrder: function(data, actions) {
				const emailInput = document.getElementById('licenseEmail') || document.getElementById('trialEmail');
				const email = emailInput ? (emailInput.value || '').trim() : '';
				return actions.order.create({
					purchase_units: [{
						amount: { value: '19.00', currency_code: 'USD' },
						custom_id: email || 'no-email'
					}]
				});
			},
			onApprove: function(data, actions) {
				return actions.order.capture().then(function(details) {
					const msg = 'Payment captured via PayPal. Your license will be issued via email.';
					setText(licenseMessage, msg);
					setBadge('active', msg);
				});
			},
			onError: function(err) {
				const msg = 'PayPal error. Please try again or use the standard Buy button.';
				setText(licenseMessage, msg);
				setBadge('inactive', msg);
			}
		}).render(paypalContainer);
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


