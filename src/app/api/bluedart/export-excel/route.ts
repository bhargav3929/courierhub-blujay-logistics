import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// BlueDart pre-defined values
const BLUEDART_PREDEFINED = {
    billingArea: "HYD",
    billingCustomerCode: "302282",
    shipperName: "RK",
    pickupAddress: "CAPITAL PARK MADHAPUR HYD",
    pickupPincode: "500081",
    senderName: "RK",
    senderMobile: "9381816882",
    productCode: "A",
    productType: "NDOX",
    pickupTime: "2000",
    officeClosureTime: "2100",
};

// Pickup Date column index (0-indexed)
const PICKUP_DATE_COL_INDEX = 3;

// ==================== VALIDATION HELPERS ====================

interface ValidationError {
    row: number;
    field: string;
    value: any;
    message: string;
}

interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

/**
 * Validate that a string is not null, undefined, or blank (after trimming)
 */
function validateMandatoryString(value: any, fieldName: string, rowIndex: number): ValidationError | null {
    if (value === null || value === undefined) {
        return { row: rowIndex + 1, field: fieldName, value, message: `${fieldName} is required and cannot be empty` };
    }
    const trimmed = String(value).trim();
    if (trimmed === '') {
        return { row: rowIndex + 1, field: fieldName, value, message: `${fieldName} is required and cannot be empty` };
    }
    return null;
}

/**
 * Validate pincode is exactly 6 digits
 */
function validatePincode(value: any, fieldName: string, rowIndex: number): ValidationError | null {
    if (value === null || value === undefined || String(value).trim() === '') {
        return { row: rowIndex + 1, field: fieldName, value, message: `${fieldName} is required` };
    }
    const pincode = String(value).trim();
    if (!/^\d{6}$/.test(pincode)) {
        return { row: rowIndex + 1, field: fieldName, value: pincode, message: `${fieldName} must be exactly 6 digits (received: "${pincode}")` };
    }
    return null;
}

/**
 * Validate that a value is a valid positive number
 */
function validateNumeric(value: any, fieldName: string, rowIndex: number, allowZero: boolean = false): ValidationError | null {
    if (value === null || value === undefined || value === '') {
        return { row: rowIndex + 1, field: fieldName, value, message: `${fieldName} is required and must be a number` };
    }
    const num = Number(value);
    if (isNaN(num)) {
        return { row: rowIndex + 1, field: fieldName, value, message: `${fieldName} must be a valid number (received: "${value}")` };
    }
    if (!allowZero && num <= 0) {
        return { row: rowIndex + 1, field: fieldName, value, message: `${fieldName} must be greater than 0 (received: ${num})` };
    }
    return null;
}

/**
 * Convert JavaScript Date to Excel serial date number
 * Uses the date portion only (midnight), accounting for IST timezone
 */
function dateToExcelSerial(date: Date): number {
    // Use IST date for Excel serial calculation
    const istDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    istDate.setHours(0, 0, 0, 0);

    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const msPerDay = 24 * 60 * 60 * 1000;

    // Calculate serial based on IST date
    const istYear = istDate.getFullYear();
    const istMonth = istDate.getMonth();
    const istDay = istDate.getDate();
    const utcDateForSerial = new Date(Date.UTC(istYear, istMonth, istDay));

    return Math.floor((utcDateForSerial.getTime() - excelEpoch.getTime()) / msPerDay);
}

/**
 * Get today's date at midnight in IST (India Standard Time)
 * Blue Dart operates in India, so we MUST use IST for date validation
 */
function getTodayMidnightIST(): Date {
    // Get current time in IST
    const now = new Date();
    const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istDate = new Date(istString);
    istDate.setHours(0, 0, 0, 0);
    return istDate;
}

/**
 * Validate and get a valid pickup date (today or future)
 */
function getValidPickupDate(shipment: any): number {
    const today = getTodayMidnightIST();
    let pickupDate: Date;

    if (shipment.pickupDate) {
        if (typeof shipment.pickupDate === 'string') {
            pickupDate = new Date(shipment.pickupDate);
        } else if (shipment.pickupDate.toDate) {
            pickupDate = shipment.pickupDate.toDate();
        } else if (shipment.pickupDate instanceof Date) {
            pickupDate = shipment.pickupDate;
        } else {
            pickupDate = today;
        }
    } else if (shipment.createdAt) {
        if (shipment.createdAt.toDate) {
            pickupDate = shipment.createdAt.toDate();
        } else if (typeof shipment.createdAt === 'string') {
            pickupDate = new Date(shipment.createdAt);
        } else {
            pickupDate = today;
        }
    } else {
        pickupDate = today;
    }

    if (isNaN(pickupDate.getTime())) {
        pickupDate = today;
    }

    pickupDate.setHours(0, 0, 0, 0);
    if (pickupDate < today) {
        pickupDate = today;
    }

    return dateToExcelSerial(pickupDate);
}

/**
 * Trim string value safely
 */
function trimString(value: any): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

/**
 * Convert to number safely
 */
function toNumber(value: any, defaultValue: number): number {
    if (value === null || value === undefined || value === '') return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
}

// ==================== SHIPMENT VALIDATION ====================

interface ValidatedShipment {
    referenceNo: string;
    billingArea: string;
    billingCustomerCode: string;
    pickupDateSerial: number;
    pickupTime: string;
    shipperName: string;
    pickupAddress: string;
    pickupPincode: string;
    companyName: string;
    deliveryAddress: string;
    deliveryPincode: string;
    productCode: string;
    productType: string;
    packType: string;
    pieceCount: number;
    actualWeight: number;
    declaredValue: number;
    registerPickup: string;
    length: number | string;
    breadth: number | string;
    height: number | string;
    toPayCustomer: string;
    sender: string;
    senderMobile: string;
    receiverTelephone: string;
    receiverMobile: string;
    receiverName: string;
    specialInstruction: string;
    commodityDetail1: string;
    commodityDetail2: string;
    commodityDetail3: string;
    referenceNo2: string;
    referenceNo3: string;
    otpBasedDelivery: string;
    officeClosureTime: string;
    awbNo: string;
}

function validateShipment(shipment: any, index: number): { validated: ValidatedShipment | null, errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    // Reference No (mandatory)
    const referenceNo = trimString(shipment.referenceNo) || `ORDER ${index + 1}`;
    const refError = validateMandatoryString(referenceNo, 'Reference No', index);
    if (refError) errors.push(refError);

    // Billing Area (mandatory)
    const billingArea = trimString(shipment.billingArea) || BLUEDART_PREDEFINED.billingArea;
    const billingError = validateMandatoryString(billingArea, 'Billing Area', index);
    if (billingError) errors.push(billingError);

    // Billing Customer Code (mandatory)
    const billingCustomerCode = trimString(shipment.billingCustomerCode) || BLUEDART_PREDEFINED.billingCustomerCode;
    const billingCodeError = validateMandatoryString(billingCustomerCode, 'Billing Customer Code', index);
    if (billingCodeError) errors.push(billingCodeError);

    // Pickup Pincode (mandatory, 6 digits)
    const pickupPincode = trimString(shipment.pickupPincode) || BLUEDART_PREDEFINED.pickupPincode;
    const pickupPincodeError = validatePincode(pickupPincode, 'Pickup Pincode', index);
    if (pickupPincodeError) errors.push(pickupPincodeError);

    // Delivery Pincode (mandatory, 6 digits)
    const deliveryPincode = trimString(shipment.destination?.pincode);
    const deliveryPincodeError = validatePincode(deliveryPincode, 'Delivery Pincode', index);
    if (deliveryPincodeError) errors.push(deliveryPincodeError);

    // Company Name (mandatory)
    const companyName = trimString(shipment.companyName) || trimString(shipment.clientName);
    const companyError = validateMandatoryString(companyName, 'Company Name', index);
    if (companyError) errors.push(companyError);

    // Delivery Address (mandatory)
    const deliveryAddress = trimString(shipment.destination?.address);
    const deliveryAddressError = validateMandatoryString(deliveryAddress, 'Delivery Address', index);
    if (deliveryAddressError) errors.push(deliveryAddressError);

    // Piece Count (mandatory, numeric, > 0)
    const pieceCount = toNumber(shipment.pieceCount, 1);
    const pieceError = validateNumeric(pieceCount, 'Piece Count', index);
    if (pieceError) errors.push(pieceError);

    // Actual Weight (mandatory, numeric, > 0)
    const actualWeight = toNumber(shipment.actualWeight || shipment.weight, 0.5);
    const weightError = validateNumeric(actualWeight, 'Actual Weight', index);
    if (weightError) errors.push(weightError);

    // Receiver Name or Destination Name
    const receiverName = trimString(shipment.receiverName) || trimString(shipment.destination?.name);
    const receiverError = validateMandatoryString(receiverName, 'Receiver Name', index);
    if (receiverError) errors.push(receiverError);

    // Receiver Mobile
    const receiverMobile = trimString(shipment.receiverMobile) || trimString(shipment.destination?.phone);
    const mobileError = validateMandatoryString(receiverMobile, 'Receiver Mobile', index);
    if (mobileError) errors.push(mobileError);

    // If errors, return early
    if (errors.length > 0) {
        return { validated: null, errors };
    }

    // Build validated shipment
    const validated: ValidatedShipment = {
        referenceNo,
        billingArea,
        billingCustomerCode,
        pickupDateSerial: getValidPickupDate(shipment),
        pickupTime: trimString(shipment.pickupTime) || BLUEDART_PREDEFINED.pickupTime,
        shipperName: trimString(shipment.shipperName) || BLUEDART_PREDEFINED.shipperName,
        pickupAddress: trimString(shipment.pickupAddress) || BLUEDART_PREDEFINED.pickupAddress,
        pickupPincode,
        companyName,
        deliveryAddress,
        deliveryPincode,
        productCode: trimString(shipment.productCode) || BLUEDART_PREDEFINED.productCode,
        productType: trimString(shipment.productType) || BLUEDART_PREDEFINED.productType,
        packType: trimString(shipment.packType),
        pieceCount,
        actualWeight,
        declaredValue: toNumber(shipment.declaredValue, 200),
        registerPickup: shipment.registerPickup ? 'Y' : '',
        length: shipment.dimensions?.length || '',
        breadth: shipment.dimensions?.width || '',
        height: shipment.dimensions?.height || '',
        toPayCustomer: shipment.toPayCustomer ? 'Y' : '',
        sender: trimString(shipment.senderName) || BLUEDART_PREDEFINED.senderName,
        senderMobile: trimString(shipment.senderMobile) || BLUEDART_PREDEFINED.senderMobile,
        receiverTelephone: trimString(shipment.receiverTelephone),
        receiverMobile,
        receiverName,
        specialInstruction: trimString(shipment.specialInstruction),
        commodityDetail1: trimString(shipment.commodityDetail1),
        commodityDetail2: trimString(shipment.commodityDetail2),
        commodityDetail3: trimString(shipment.commodityDetail3),
        referenceNo2: trimString(shipment.referenceNo2),
        referenceNo3: trimString(shipment.referenceNo3),
        otpBasedDelivery: shipment.otpBasedDelivery ? 'Y' : '',
        officeClosureTime: trimString(shipment.officeClosureTime) || BLUEDART_PREDEFINED.officeClosureTime,
        awbNo: trimString(shipment.courierTrackingId),
    };

    return { validated, errors: [] };
}

// ==================== ROW GENERATION ====================

function validatedToRow(v: ValidatedShipment): (string | number)[] {
    return [
        v.referenceNo,
        v.billingArea,
        v.billingCustomerCode,
        v.pickupDateSerial, // Will be overwritten with date cell
        v.pickupTime,
        v.shipperName,
        v.pickupAddress,
        v.pickupPincode,
        v.companyName,
        v.deliveryAddress,
        v.deliveryPincode,
        v.productCode,
        v.productType,
        v.packType,
        v.pieceCount,
        v.actualWeight,
        v.declaredValue,
        v.registerPickup,
        v.length,
        v.breadth,
        v.height,
        v.toPayCustomer,
        v.sender,
        v.senderMobile,
        v.receiverTelephone,
        v.receiverMobile,
        v.receiverName,
        v.specialInstruction,
        v.commodityDetail1,
        v.commodityDetail2,
        v.commodityDetail3,
        v.referenceNo2,
        v.referenceNo3,
        v.otpBasedDelivery,
        v.officeClosureTime,
        v.awbNo,
        '', '', '', '', '', '', '', '', '', '' // Output columns (empty)
    ];
}

// ==================== MAIN API HANDLER ====================

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { shipments } = body;

        if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
            return NextResponse.json(
                { error: 'No shipments provided', validationErrors: [] },
                { status: 400 }
            );
        }

        // ==================== VALIDATE ALL SHIPMENTS ====================
        const allErrors: ValidationError[] = [];
        const validatedShipments: ValidatedShipment[] = [];

        for (let i = 0; i < shipments.length; i++) {
            const { validated, errors } = validateShipment(shipments[i], i);
            if (errors.length > 0) {
                allErrors.push(...errors);
            }
            if (validated) {
                validatedShipments.push(validated);
            }
        }

        // If any validation errors, STOP and return errors
        if (allErrors.length > 0) {
            return NextResponse.json({
                error: 'Validation failed. Please fix the following errors before exporting.',
                validationErrors: allErrors,
                errorCount: allErrors.length,
                shipmentsWithErrors: [...new Set(allErrors.map(e => e.row))].length
            }, { status: 400 });
        }

        // ==================== LOAD TEMPLATE ====================
        const templatePath = path.join(process.cwd(), 'public', 'templates', 'Domestic Priority - Lite.xlsx');

        if (!fs.existsSync(templatePath)) {
            return NextResponse.json(
                { error: 'Template file not found', validationErrors: [] },
                { status: 500 }
            );
        }

        const templateBuffer = fs.readFileSync(templatePath);
        const workbook = XLSX.read(templateBuffer, { type: 'buffer' });

        // ==================== GET WAYBILL SHEET ====================
        const waybillSheet = workbook.Sheets['Waybill'];
        if (!waybillSheet) {
            return NextResponse.json(
                { error: 'Waybill sheet not found in template', validationErrors: [] },
                { status: 500 }
            );
        }

        // Clear existing data rows (keep headers)
        const range = XLSX.utils.decode_range(waybillSheet['!ref'] || 'A1:AT1');
        for (let r = 1; r <= range.e.r; r++) {
            for (let c = 0; c <= range.e.c; c++) {
                delete waybillSheet[XLSX.utils.encode_cell({ r, c })];
            }
        }

        // ==================== POPULATE DATA ====================
        validatedShipments.forEach((validated, index) => {
            const rowData = validatedToRow(validated);
            const rowIndex = index + 1; // Row 2+ (0-indexed: 1+)

            rowData.forEach((value, colIndex) => {
                const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });

                // Special handling for Pickup Date column - write as Excel date
                if (colIndex === PICKUP_DATE_COL_INDEX) {
                    waybillSheet[addr] = {
                        t: 'n',
                        v: validated.pickupDateSerial,
                        z: 'M/D/YY'
                    };
                } else if (value !== '' && value !== null && value !== undefined) {
                    waybillSheet[addr] = {
                        t: typeof value === 'number' ? 'n' : 's',
                        v: value
                    };
                }
            });
        });

        // Update sheet range
        waybillSheet['!ref'] = XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: validatedShipments.length, c: 45 }
        });

        // Clear Dimensions and ItemDetails (keep headers only)
        ['Dimensions', 'ItemDetails'].forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            if (sheet && sheet['!ref']) {
                const sheetRange = XLSX.utils.decode_range(sheet['!ref']);
                for (let r = 1; r <= sheetRange.e.r; r++) {
                    for (let c = 0; c <= sheetRange.e.c; c++) {
                        delete sheet[XLSX.utils.encode_cell({ r, c })];
                    }
                }
                sheet['!ref'] = XLSX.utils.encode_range({
                    s: { r: 0, c: 0 },
                    e: { r: 0, c: sheetRange.e.c }
                });
            }
        });

        // ==================== GENERATE FILE ====================
        const outputBuffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: 'xlsx'
        });

        const today = new Date().toISOString().split('T')[0];
        const filename = `BlueDart_Shipments_${today}.xlsx`;

        return new NextResponse(outputBuffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error) {
        console.error('Error generating BlueDart Excel:', error);
        return NextResponse.json(
            { error: 'Failed to generate Excel file', details: error instanceof Error ? error.message : 'Unknown error', validationErrors: [] },
            { status: 500 }
        );
    }
}


