import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

// Interfaces
interface BlueDartConfig {
    clientId: string;
    clientSecret: string;
    loginId: string;
    licenseKey: string;
    customerCode: string;
    isProduction: boolean;
}

interface AuthResponse {
    JWTToken?: string;
    token?: string;
    expires_in?: number;
}

// Service Class
class BlueDartService {
    private client: AxiosInstance;
    private config: BlueDartConfig;
    private jwtToken: string | null = null;
    private tokenExpiry: Date | null = null;

    private readonly SANDBOX_URL = "https://apigateway-sandbox.bluedart.com/in/transportation";
    private readonly PROD_URL = "https://apigateway.bluedart.com/in/transportation";

    constructor(config: BlueDartConfig) {
        this.config = config;
        this.client = axios.create({
            baseURL: config.isProduction ? this.PROD_URL : this.SANDBOX_URL,
            timeout: 30000,
        });

        // Request Interceptor to inject JWT
        this.client.interceptors.request.use(
            async (requestConfig) => {
                // Skip auth for login endpoint
                if (requestConfig.url?.includes('/token/v1/login')) {
                    return requestConfig;
                }

                // Ensure token is valid
                if (!this.isValidToken()) {
                    await this.authenticate();
                }

                // Add Authorization header
                if (this.jwtToken) {
                    requestConfig.headers.Authorization = `Bearer ${this.jwtToken}`;
                }

                // Add content type
                requestConfig.headers['Content-Type'] = 'application/json';

                return requestConfig;
            },
            (error) => Promise.reject(error)
        );

        // Response Interceptor for 401 handling
        this.client.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;

                // If 401 and we haven't retried yet
                if (error.response?.status === 401 && !originalRequest._retry) {
                    originalRequest._retry = true;
                    try {
                        await this.authenticate(); // Force refresh
                        // Update header with new token
                        originalRequest.headers.Authorization = `Bearer ${this.jwtToken}`;
                        return this.client(originalRequest);
                    } catch (retryError) {
                        return Promise.reject(retryError);
                    }
                }
                return Promise.reject(error);
            }
        );
    }

    private isValidToken(): boolean {
        if (!this.jwtToken || !this.tokenExpiry) return false;
        // Buffer of 5 minutes
        const now = new Date();
        return now.getTime() < (this.tokenExpiry.getTime() - 5 * 60 * 1000);
    }

    /**
     * authenticate
     * Generates JWT token from Blue Dart
     */
    public async authenticate(): Promise<string> {
        try {
            console.log('Authenticating with Blue Dart...');
            // Authenticate using GET with Query Params (Verified working in Prod)
            const response = await this.client.get<AuthResponse>('/token/v1/login', {
                params: {
                    clientID: this.config.clientId,
                    clientSecret: this.config.clientSecret
                }
            });

            const token = response.data.JWTToken || response.data.token;

            if (!token) {
                throw new Error('No token received from Blue Dart');
            }

            this.jwtToken = token;
            // Validity 24 hours usually
            this.tokenExpiry = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);

            console.log('Blue Dart Authentication Successful');
            return token;
        } catch (error) {
            console.error('Blue Dart Auth Failed:', error);
            throw error;
        }
    }

    /**
     * validatePincode
     * Step 3.1: Location Finder
     * UPDATED: Now calls Next.js API route to avoid CORS
     */
    public async validatePincode(pincode: string) {
        try {
            const response = await axios.get(`/api/bluedart/validate-pincode?pincode=${pincode}`);
            return response.data;
        } catch (error) {
            console.error('Pincode validation failed:', error);
            throw error;
        }
    }

    /**
     * getProducts
     * Step 3.2: Get Products & Sub-Products
     */
    public async getProducts(origin: string, destination: string) {
        try {
            // Assuming endpoint based on standard flow
            const response = await this.client.get('/finder/v1/products', {
                params: { origin, destination }
            });
            return response.data;
        } catch (error) {
            console.error('Get Products failed:', error);
            throw error;
        }
    }

    /**
     * getTransitTime
     * Step 3.3: Transit Time API
     */
    public async getTransitTime(origin: string, destination: string, productCode: string, weight: number) {
        try {
            const response = await this.client.get('/finder/v1/transittime', {
                params: {
                    origin,
                    destination,
                    productCode,
                    weight
                }
            });
            return response.data;
        } catch (error) {
            console.error('Transit Time fetch failed:', error);
            throw error;
        }
    }

    /**
     * generateWaybill
     * Step 3.4: Generate Waybill
     * THIS IS THE BOOKING STEP
     */
    /**
     * generateWaybill
     * Step 3.4: Generate Waybill
     * THIS IS THE BOOKING STEP
     * CAUTION: Uses local API route to bypass CORS
     */
    public async generateWaybill(shipmentData: any) {
        try {
            // Ensure Profile is present (API route might handle auth, but we pass full payload)
            // Ideally core payload is clean, but let's pass what we constructed.
            // The API route expects the DIRECT Blue Dart payload structure or constructs it.
            // Assuming API route simply proxies the body + adds Auth.

            const payload = {
                ...shipmentData,
                Profile: {
                    LoginID: this.config.loginId,
                    LicenceKey: this.config.licenseKey,
                    Api_type: 'S',
                    Version: '1.10'
                }
            };

            // Call Next.js API Route
            const response = await axios.post('/api/bluedart/generate-waybill', payload);
            return response.data;
        } catch (error) {
            console.error('Waybill generation failed:', error);
            throw error;
        }
    }

    /**
     * registerPickup
     * Step 3.5: Register Pickup
     * Must only be called after successful Waybill generation
     */
    public async registerPickup(waybillNumber: string, pickupTime: string, pickupDate: string) {
        try {
            // Note: If you haven't created a route for this, it will fail.
            // For now, let's assume we won't fix this unless requested, OR we stub it.
            console.warn("Pickup Registration API route not yet implemented");
            return null;
        } catch (error) {
            console.error('Pickup registration failed:', error);
            throw error;
        }
    }

    /**
     * trackShipment
     * Step 3.6: Tracking API
     */
    public async trackShipment(awbNumber: string) {
        try {
            // Note: If you haven't created a route for this, it will fail.
            // We should create a route later.
            console.warn("Tracking API route not yet implemented");
            return null;
        } catch (error) {
            console.error('Tracking failed:', error);
            throw error;
        }
    }
}

// Export a singleton or factory
export const createBlueDartService = () => {
    const config: BlueDartConfig = {
        clientId: process.env.NEXT_PUBLIC_BLUEDART_CLIENT_ID || '',
        clientSecret: process.env.NEXT_PUBLIC_BLUEDART_CLIENT_SECRET || '',
        loginId: process.env.NEXT_PUBLIC_BLUEDART_LOGIN_ID || '',
        licenseKey: process.env.NEXT_PUBLIC_BLUEDART_LICENSE_KEY || '',
        customerCode: process.env.NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE || '',
        isProduction: (process.env.NEXT_PUBLIC_BLUEDART_ENV || '').toLowerCase() === 'production',
    };

    return new BlueDartService(config);
};

export const blueDartService = createBlueDartService();
