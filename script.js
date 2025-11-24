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
					alert('Connect a checkout link first. Edit data-payment-link on the Buy buttons.');
				}
			});
		});
	}

	wireBuyButtons();

	// Scroll reveal for elements with [data-reveal]
	function setupReveal() {
		const els = Array.from(document.querySelectorAll('[data-reveal]'));
		if (!('IntersectionObserver' in window)) {
			els.forEach(function(el) { el.classList.add('visible'); });
			return;
		}
		const io = new IntersectionObserver(function(entries) {
			entries.forEach(function(entry) {
				if (entry.isIntersecting) {
					entry.target.classList.add('visible');
					io.unobserve(entry.target);
				}
			});
		}, { threshold: 0.15 });
		els.forEach(function(el) { io.observe(el); });
	}

	setupReveal();

	// Interactive feature row effects
	function setupFeatureInteractions() {
		const featureRows = document.querySelectorAll('.feature-row');
		
		// Mouse tracking for glow effect
		featureRows.forEach(function(row) {
			row.addEventListener('mousemove', function(e) {
				const rect = row.getBoundingClientRect();
				const x = ((e.clientX - rect.left) / rect.width) * 100;
				const y = ((e.clientY - rect.top) / rect.height) * 100;
				row.style.setProperty('--mouse-x', x + '%');
				row.style.setProperty('--mouse-y', y + '%');
			});
			
			// Reset glow position on mouse leave
			row.addEventListener('mouseleave', function() {
				row.style.setProperty('--mouse-x', '50%');
				row.style.setProperty('--mouse-y', '50%');
			});
		});
		
		// Hero video - always play
		const heroVideo = document.querySelector('.hero-video');
		if (heroVideo) {
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
		
		// Feature videos - play only when hovering directly on video
		const featureVideos = document.querySelectorAll('.feature-video');
		featureVideos.forEach(function(video) {
			const mediaFrame = video.closest('.media-frame');
			const featureRow = video.closest('.feature-row');
			
			if (!mediaFrame || !featureRow) return;
			
			// Check if screen is large enough for side-by-side layout
			function isLargeScreen() {
				return window.innerWidth >= 992;
			}
			
			// Play on hover
			mediaFrame.addEventListener('mouseenter', function() {
				video.play().catch(function() {
					// Ignore autoplay restrictions
				});
				// Add class to adjust layout only on large screens
				if (isLargeScreen()) {
					featureRow.classList.add('video-expanded');
				}
			});
			
			// Pause when mouse leaves
			mediaFrame.addEventListener('mouseleave', function() {
				video.pause();
				// Remove class to restore layout
				featureRow.classList.remove('video-expanded');
			});
			
			// Remove class on window resize if screen becomes small
			window.addEventListener('resize', function() {
				if (!isLargeScreen()) {
					featureRow.classList.remove('video-expanded');
				}
			});
			
			// Pause when not in viewport to save resources
			const videoObserver = new IntersectionObserver(function(entries) {
				entries.forEach(function(entry) {
					if (!entry.isIntersecting && !video.paused) {
						video.pause();
						featureRow.classList.remove('video-expanded');
					}
				});
			}, { threshold: 0.1 });
			
			videoObserver.observe(video);
		});
		
		// Add subtle parallax on scroll for feature rows
		let ticking = false;
		function updateParallax() {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(function() {
				featureRows.forEach(function(row) {
					const rect = row.getBoundingClientRect();
					const scrolled = window.pageYOffset;
					const rate = (scrolled - rect.top) * 0.02;
					if (rect.top < window.innerHeight && rect.bottom > 0) {
						row.style.transform = `translateY(${rate}px)`;
					}
				});
				ticking = false;
			});
		}
		
		window.addEventListener('scroll', updateParallax, { passive: true });
	}
	
	setupFeatureInteractions();

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
})();


