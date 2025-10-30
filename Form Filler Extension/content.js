// Field mapping configurations - expanded with case variations
const fieldPatterns = {
    email: ['email', 'e-mail', 'mail', 'correo', 'emailaddress', 'email_address', 'emailaddress', 'user_email', 'contact_email', 'primary_email'],
    password: ['password', 'pass', 'pwd', 'contraseña', 'passwd', 'user_password', 'login_password', 'account_password'],
    confirmPassword: ['confirm', 'retype', 'repeat', 'password2', 'confirm_password', 'passwordconfirm', 'confirmpassword', 'repassword', 'verify_password', 'password_confirm'],
    username: ['username', 'user', 'usuario', 'nickname', 'nick', 'userid', 'user_name', 'login', 'login_name', 'account_name', 'display_name'],
    firstName: ['firstname', 'first_name', 'fname', 'given_name', 'nombre', 'first', 'forename', 'first_name', 'givenname', 'firstname'],
    lastName: ['lastname', 'last_name', 'lname', 'surname', 'apellido', 'last', 'family_name', 'familyname', 'lastname'],
    fullName: ['name', 'fullname', 'full_name', 'nombre_completo', 'your_name', 'displayname', 'complete_name', 'full_name', 'user_name', 'contact_name'],
    birthday: ['birthday', 'birth', 'dob', 'date_of_birth', 'birthdate', 'dateofbirth', 'nascimento', 'birth_date', 'date_of_birth'],
    gender: ['gender', 'sex', 'genero', 'sexo', 'male_female', 'gender_selection'],
    phone: ['phone', 'mobile', 'tel', 'telefono', 'celular', 'telephone', 'phonenumber', 'phone_number', 'contact_phone', 'mobile_number', 'phone_number']
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request.action);
    
    if (request.action === 'ping') {
        // Respond to ping to confirm content script is loaded
        sendResponse({ status: 'ready' });
        return true;
    }
    
    if (request.action === 'fillForm') {
        try {
            fillForm(request.data, request.mapping);
            sendResponse({ success: true });
        } catch (error) {
            console.error('Error in fillForm:', error);
            sendResponse({ success: false, error: error.message });
        }
    } else if (request.action === 'collectFields') {
        try {
            const fields = collectFormFields();
            sendResponse({ fields: fields });
        } catch (error) {
            console.error('Error in collectFields:', error);
            sendResponse({ fields: [], error: error.message });
        }
    }
    return true;
});

// Fill form with data
function fillForm(data, customMapping = {}) {
    console.log('Filling form with data:', data);
    
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
    let filledCount = 0;
    
    // Process fullName data to split into firstName and lastName if needed
    const processedData = processFullNameData(data);
    
    inputs.forEach(input => {
        // Skip if already filled
        if (input.value && input.type !== 'checkbox' && input.type !== 'radio') {
            return;
        }
        
        const fieldType = detectFieldType(input);
        console.log(`Field ${input.name || input.id}: detected as ${fieldType}`);
        
        // Try multiple data key variations
        let value = null;
        
        // First try custom mapping
        if (customMapping[input.name]) {
            value = processedData[customMapping[input.name]];
        }
        
        // Then try detected field type
        if (!value && fieldType) {
            // Try exact match
            value = processedData[fieldType];
            
            // Try lowercase match
            if (!value) {
                value = processedData[fieldType.toLowerCase()];
            }
            
            // Try common variations
            if (!value) {
                const variations = getFieldVariations(fieldType);
                for (const variation of variations) {
                    if (processedData[variation]) {
                        value = processedData[variation];
                        break;
                    }
                }
            }
        }
        
        // Try to match by input name/id directly
        if (!value && input.name) {
            value = processedData[input.name] || processedData[input.name.toLowerCase()];
        }
        if (!value && input.id) {
            value = processedData[input.id] || processedData[input.id.toLowerCase()];
        }
        
        if (value) {
            fillField(input, value, fieldType);
            filledCount++;
            console.log(`Filled ${input.name || input.id} with ${value}`);
        }
    });
    
    console.log(`Filled ${filledCount} fields`);
    
    // Trigger change events to update any JavaScript-driven validation
    inputs.forEach(input => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    });
}

// Process fullName data to split into firstName and lastName if needed
function processFullNameData(data) {
    const processedData = { ...data };
    
    // If we have fullName but no firstName/lastName, split it
    if (processedData.fullName && !processedData.firstName && !processedData.lastName) {
        const nameParts = processedData.fullName.trim().split(' ');
        if (nameParts.length >= 2) {
            processedData.firstName = nameParts[0];
            processedData.lastName = nameParts.slice(1).join(' '); // Handle multiple last names
        } else if (nameParts.length === 1) {
            processedData.firstName = nameParts[0];
            processedData.lastName = '';
        }
    }
    
    // Also handle case variations
    if (processedData.fullname && !processedData.firstname && !processedData.lastname) {
        const nameParts = processedData.fullname.trim().split(' ');
        if (nameParts.length >= 2) {
            processedData.firstname = nameParts[0];
            processedData.lastname = nameParts.slice(1).join(' ');
        } else if (nameParts.length === 1) {
            processedData.firstname = nameParts[0];
            processedData.lastname = '';
        }
    }
    
    // Handle Name field (capital N)
    if (processedData.Name && !processedData.FirstName && !processedData.LastName) {
        const nameParts = processedData.Name.trim().split(' ');
        if (nameParts.length >= 2) {
            processedData.FirstName = nameParts[0];
            processedData.LastName = nameParts.slice(1).join(' ');
        } else if (nameParts.length === 1) {
            processedData.FirstName = nameParts[0];
            processedData.LastName = '';
        }
    }
    
    return processedData;
}

// Get common field name variations
function getFieldVariations(fieldType) {
    const variations = {
        email: ['email', 'Email', 'EMAIL', 'mail', 'e-mail', 'emailAddress', 'user_email', 'contact_email', 'primary_email', 'emailaddress'],
        password: ['password', 'Password', 'PASSWORD', 'pass', 'pwd', 'user_password', 'login_password', 'account_password', 'passwd'],
        confirmPassword: ['confirm', 'retype', 'repeat', 'password2', 'confirm_password', 'passwordconfirm', 'confirmpassword', 'repassword', 'verify_password', 'password_confirm'],
        username: ['username', 'Username', 'USERNAME', 'user', 'login', 'userid', 'user_name', 'login_name', 'account_name', 'display_name', 'nickname', 'nick'],
        firstName: ['firstName', 'firstname', 'FirstName', 'first_name', 'fname', 'first', 'given_name', 'forename', 'givenname'],
        lastName: ['lastName', 'lastname', 'LastName', 'last_name', 'lname', 'last', 'surname', 'family_name', 'familyname'],
        fullName: ['name', 'Name', 'NAME', 'fullName', 'fullname', 'full_name', 'complete_name', 'user_name', 'contact_name', 'displayname', 'your_name'],
        birthday: ['birthday', 'Birthday', 'birthdate', 'birth_date', 'dob', 'dateOfBirth', 'date_of_birth', 'nascimento'],
        gender: ['gender', 'Gender', 'GENDER', 'sex', 'male_female', 'gender_selection'],
        phone: ['phone', 'Phone', 'PHONE', 'mobile', 'telephone', 'phoneNumber', 'phone_number', 'contact_phone', 'mobile_number', 'tel', 'celular']
    };
    
    return variations[fieldType] || [];
}

// Detect field type based on attributes
function detectFieldType(field) {
    const checkString = (
        (field.name || '') + ' ' +
        (field.id || '') + ' ' +
        (field.placeholder || '') + ' ' +
        (field.getAttribute('aria-label') || '') + ' ' +
        (field.className || '') + ' ' +
        getLabelText(field)
    ).toLowerCase();
    
    for (const [fieldType, patterns] of Object.entries(fieldPatterns)) {
        if (patterns.some(pattern => checkString.includes(pattern))) {
            return fieldType;
        }
    }
    
    // Check input type
    if (field.type === 'email') return 'email';
    if (field.type === 'password') return 'password';
    if (field.type === 'tel') return 'phone';
    if (field.type === 'date') return 'birthday';
    
    return null;
}

// Get label text for a field
function getLabelText(field) {
    // Check for label with 'for' attribute
    if (field.id) {
        const label = document.querySelector(`label[for="${field.id}"]`);
        if (label) return label.textContent || '';
    }
    
    // Check for parent label
    const parentLabel = field.closest('label');
    if (parentLabel) return parentLabel.textContent || '';
    
    // Check for nearby label
    const previousElement = field.previousElementSibling;
    if (previousElement && previousElement.tagName === 'LABEL') {
        return previousElement.textContent || '';
    }
    
    // Check for aria-labelledby
    const labelledBy = field.getAttribute('aria-labelledby');
    if (labelledBy) {
        const label = document.getElementById(labelledBy);
        if (label) return label.textContent || '';
    }
    
    return '';
}

// Fill individual field
function fillField(field, value, fieldType) {
    try {
        if (field.type === 'checkbox' || field.type === 'radio') {
            // Handle checkboxes and radio buttons
            if (fieldType === 'gender') {
                const fieldValue = field.value.toLowerCase();
                const dataValue = value.toLowerCase();
                
                // Check for matching values
                if (fieldValue === dataValue || 
                    (fieldValue === 'm' && dataValue === 'male') ||
                    (fieldValue === 'f' && dataValue === 'female') ||
                    (fieldValue === 'male' && dataValue === 'm') ||
                    (fieldValue === 'female' && dataValue === 'f')) {
                    field.checked = true;
                    field.click(); // Some sites need click event
                }
            } else {
                field.checked = true;
                field.click();
            }
        } else if (field.tagName === 'SELECT') {
            // Handle select dropdowns
            const options = Array.from(field.options);
            const matchingOption = options.find(opt => 
                opt.value.toLowerCase() === value.toLowerCase() ||
                opt.textContent.toLowerCase().trim() === value.toLowerCase().trim()
            );
            if (matchingOption) {
                field.value = matchingOption.value;
            } else {
                // Try partial match
                const partialMatch = options.find(opt =>
                    opt.value.toLowerCase().includes(value.toLowerCase()) ||
                    opt.textContent.toLowerCase().includes(value.toLowerCase())
                );
                if (partialMatch) {
                    field.value = partialMatch.value;
                }
            }
        } else if (field.type === 'date' && fieldType === 'birthday') {
            // Handle date inputs
            field.value = formatDate(value);
        } else {
            // Handle regular text inputs
            field.value = value;
            
            // For React/Vue/Angular compatibility
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, "value"
            ).set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(field, value);
            }
        }
        
        // Trigger multiple events for better compatibility
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));
        
    } catch (error) {
        console.error('Error filling field:', error);
    }
}

// Format date for date input
function formatDate(dateString) {
    try {
        // Try multiple date formats
        let date;
        
        // Try ISO format
        date = new Date(dateString);
        
        // Try MM/DD/YYYY or DD/MM/YYYY
        if (isNaN(date.getTime())) {
            const parts = dateString.split(/[-\/]/);
            if (parts.length === 3) {
                // Assume MM/DD/YYYY if first part <= 12
                if (parseInt(parts[0]) <= 12) {
                    date = new Date(parts[2], parts[0] - 1, parts[1]);
                } else {
                    date = new Date(parts[2], parts[1] - 1, parts[0]);
                }
            }
        }
        
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    } catch (e) {
        console.error('Date parsing error:', e);
    }
    return dateString;
}

// Collect all form fields for mapping
function collectFormFields() {
    const fields = [];
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
    
    inputs.forEach(input => {
        fields.push({
            name: input.name || '',
            id: input.id || '',
            type: input.type || input.tagName.toLowerCase(),
            placeholder: input.placeholder || '',
            label: getLabelText(input),
            detectedType: detectFieldType(input),
            value: input.value || ''
        });
    });
    
    return fields;
}

// Log that content script is loaded
console.log('Form Auto-Filler content script loaded');