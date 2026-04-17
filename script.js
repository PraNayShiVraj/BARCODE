document.addEventListener('DOMContentLoaded', () => {
    const barcodeInput = document.getElementById('barcode-input');
    const dropZone = document.getElementById('drop-zone');
    const loadingSection = document.getElementById('loading');
    const errorSection = document.getElementById('error-display');
    const resultSection = document.getElementById('result-display');
    const uploadSection = document.querySelector('.upload-section');
    const cameraSection = document.getElementById('camera-section');
    
    // Camera Controls
    const openCameraBtn = document.getElementById('open-camera-btn');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    const switchCameraBtn = document.getElementById('switch-camera-btn');
    
    let videoInputDevices = [];
    let currentDeviceIndex = 0;
    
    // Result & Error Controls
    const backHomeBtn = document.getElementById('back-home-btn');
    const headerBackBtn = document.getElementById('header-back-btn');
    const errorBackBtn = document.getElementById('error-back-btn');
    
    // Barcode Reader instance with optimized hints
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.CODE_39
    ]);

    const codeReader = new ZXing.BrowserMultiFormatReader(hints);

    // Handle file selection
    barcodeInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    });

    // Drag & Drop handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.querySelector('.upload-card').style.borderColor = 'var(--primary)';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.querySelector('.upload-card').style.borderColor = 'var(--glass-border)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.querySelector('.upload-card').style.borderColor = 'var(--glass-border)';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            processFile(file);
        }
    });

    // Camera Event Listeners
    openCameraBtn.addEventListener('click', startCamera);
    closeCameraBtn.addEventListener('click', stopCamera);
    switchCameraBtn.addEventListener('click', switchCamera);
    
    // Navigation Control
    backHomeBtn.addEventListener('click', showHome);
    headerBackBtn.addEventListener('click', showHome);
    errorBackBtn.addEventListener('click', showHome);

    async function startCamera() {
        try {
            videoInputDevices = await codeReader.listVideoInputDevices();
            
            if (videoInputDevices.length === 0) {
                showError('No camera devices found on this device.');
                return;
            }

            // Try to find the back camera first
            currentDeviceIndex = videoInputDevices.findIndex(device => 
                device.label.toLowerCase().includes('back') || 
                device.label.toLowerCase().includes('rear')
            );
            if (currentDeviceIndex === -1) currentDeviceIndex = 0;

            hideAll();
            cameraSection.classList.remove('hidden');
            
            // Start continuous scanning
            decodeFromCamera(videoInputDevices[currentDeviceIndex].deviceId);
        } catch (err) {
            console.error('Camera start error:', err);
            showError('Could not access camera. Please ensure permissions are granted and you are using a secure connection (HTTPS).');
        }
    }

    function decodeFromCamera(deviceId) {
        codeReader.decodeFromVideoDevice(deviceId, 'video-preview', async (result, err) => {
            if (result) {
                console.log('Barcode detected via camera:', result.text);
                // Immediately stop camera to prevent duplicate scans
                stopCamera();
                showLoading();
                await fetchProductData(result.text);
            }
            // Continuous scanning errors (if no barcode found) are suppressed to avoid log spam
        });
    }

    function stopCamera() {
        codeReader.reset();
        cameraSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
    }

    async function switchCamera() {
        if (videoInputDevices.length <= 1) return;
        
        currentDeviceIndex = (currentDeviceIndex + 1) % videoInputDevices.length;
        codeReader.reset();
        decodeFromCamera(videoInputDevices[currentDeviceIndex].deviceId);
    }

    async function processFile(file) {
        showLoading();
        const imageUrl = URL.createObjectURL(file);
        
        try {
            // Attempt 1: Native BarcodeDetector API (Fastest and most robust for digital images)
            let barcode = await tryNativeDetector(file);
            
            // Attempt 2: ZXing Library (Fallback for unsupported browsers or complex images)
            if (!barcode) {
                barcode = await tryZXingDetector(imageUrl);
            }

            if (barcode) {
                console.log('Barcode detected:', barcode);
                await fetchProductData(barcode);
            } else {
                showError('Could not detect a clear barcode in this image. Please ensure the barcode is well-lit and in focus.');
            }
        } catch (err) {
            console.error('File processing error:', err);
            showError('Something went wrong while processing the image.');
        } finally {
            URL.revokeObjectURL(imageUrl);
        }
    }

    async function tryNativeDetector(file) {
        if (!('BarcodeDetector' in window)) {
            console.log('Native BarcodeDetector not supported in this browser.');
            return null;
        }

        try {
            const detector = new BarcodeDetector({ 
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] 
            });
            const results = await detector.detect(file);
            return results.length > 0 ? results[0].rawValue : null;
        } catch (err) {
            console.warn('Native detection failed:', err);
            return null;
        }
    }

    async function tryZXingDetector(imageUrl) {
        try {
            const result = await codeReader.decodeFromImageUrl(imageUrl);
            return result.text;
        } catch (err) {
            console.warn('ZXing detection failed:', err);
            return null;
        }
    }

    async function fetchProductData(barcode) {
        const apiUrl = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
        
        try {
            const response = await fetch(apiUrl);
            const data = await response.json();
            
            if (data.status === 1) {
                displayProduct(data.product, barcode);
            } else {
                showError(`Product not found (Barcode: ${barcode}). It might not be in the Open Food Facts database yet.`);
            }
        } catch (err) {
            console.error('API Fetch error:', err);
            showError('Failed to fetch data from Open Food Facts. Please check your connection.');
        }
    }

    function displayProduct(product, barcode) {
        document.getElementById('product-name').textContent = product.product_name || 'Unknown Product';
        document.getElementById('product-brand').textContent = product.brands || 'Unknown Brand';
        document.getElementById('barcode-value').textContent = barcode;
        document.getElementById('product-categories').textContent = product.categories || 'Not specified';
        document.getElementById('product-ingredients').textContent = product.ingredients_text || 'No ingredient information available for this product.';
        
        const productImg = document.getElementById('product-img');
        productImg.src = product.image_url || 'https://via.placeholder.com/200?text=No+Image';
        
        const nutriscore = product.nutriscore_grade ? product.nutriscore_grade.toUpperCase() : '?';
        const badge = document.getElementById('nutriscore-badge');
        badge.querySelector('span').textContent = nutriscore;
        
        // Color coding for nutriscore
        const colors = {
            'A': '#038141',
            'B': '#85bb2f',
            'C': '#fecb02',
            'D': '#ee8100',
            'E': '#e63e11'
        };
        badge.style.borderColor = colors[nutriscore] || 'var(--glass-border)';
        badge.style.color = colors[nutriscore] || 'var(--text-main)';

        hideAll();
        resultSection.classList.remove('hidden');
    }

    function showLoading() {
        hideAll();
        loadingSection.classList.remove('hidden');
    }

    function showError(message) {
        hideAll();
        document.getElementById('error-message').textContent = message;
        errorSection.classList.remove('hidden');
    }

    function hideAll() {
        uploadSection.classList.add('hidden');
        loadingSection.classList.add('hidden');
        errorSection.classList.add('hidden');
        resultSection.classList.add('hidden');
        cameraSection.classList.add('hidden');
    }

    function showHome() {
        hideAll();
        uploadSection.classList.remove('hidden');
        // Reset any temporary states if needed
        barcodeInput.value = ''; // Clear file input
    }
});
