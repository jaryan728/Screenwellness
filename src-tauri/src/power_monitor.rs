#[cfg(target_os = "windows")]
mod win {
    use std::ffi::c_void;
    use std::sync::OnceLock;
    use tauri::Emitter;

    pub(super) static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

    type HWND = *mut c_void;
    type HINSTANCE = *mut c_void;

    const WM_POWERBROADCAST: u32 = 0x0218;
    const PBT_APMSUSPEND: usize = 0x0004;
    const PBT_APMRESUMESUSPEND: usize = 0x0007;
    const PBT_APMRESUMEAUTOMATIC: usize = 0x0012;

    #[repr(C)]
    pub(super) struct WNDCLASSEXW {
        pub cb_size: u32,
        pub style: u32,
        pub lpfn_wnd_proc: unsafe extern "system" fn(HWND, u32, usize, isize) -> isize,
        pub cb_cls_extra: i32,
        pub cb_wnd_extra: i32,
        pub h_instance: HINSTANCE,
        pub h_icon: HWND,
        pub h_cursor: HWND,
        pub h_br_background: HWND,
        pub lpsz_menu_name: *const u16,
        pub lpsz_class_name: *const u16,
        pub h_icon_sm: HWND,
    }

    #[repr(C)]
    pub(super) struct MSG {
        pub hwnd: HWND,
        pub message: u32,
        pub w_param: usize,
        pub l_param: isize,
        pub time: u32,
        pub pt_x: i32,
        pub pt_y: i32,
    }

    #[link(name = "user32")]
    extern "system" {
        pub(super) fn RegisterClassExW(lpwcx: *const WNDCLASSEXW) -> u16;
        pub(super) fn CreateWindowExW(
            dw_ex_style: u32,
            lp_class_name: *const u16,
            lp_window_name: *const u16,
            dw_style: u32,
            x: i32, y: i32, n_width: i32, n_height: i32,
            h_wnd_parent: HWND,
            h_menu: *mut c_void,
            h_instance: HINSTANCE,
            lp_param: *mut c_void,
        ) -> HWND;
        pub(super) fn DefWindowProcW(hwnd: HWND, msg: u32, w: usize, l: isize) -> isize;
        pub(super) fn GetMessageW(lp: *mut MSG, hwnd: HWND, min: u32, max: u32) -> i32;
        pub(super) fn TranslateMessage(lp: *const MSG) -> i32;
        pub(super) fn DispatchMessageW(lp: *const MSG) -> isize;
        pub(super) fn GetModuleHandleW(name: *const u16) -> HINSTANCE;
    }

    pub(super) unsafe extern "system" fn wnd_proc(
        hwnd: HWND, msg: u32, w_param: usize, l_param: isize,
    ) -> isize {
        if msg == WM_POWERBROADCAST {
            match w_param {
                PBT_APMSUSPEND => {
                    if let Some(app) = APP.get() {
                        let _ = app.emit("display-sleep", ());
                    }
                    return 1;
                }
                PBT_APMRESUMESUSPEND | PBT_APMRESUMEAUTOMATIC => {
                    if let Some(app) = APP.get() {
                        let _ = app.emit("display-wake", ());
                    }
                    return 1;
                }
                _ => {}
            }
        }
        DefWindowProcW(hwnd, msg, w_param, l_param)
    }
}

pub fn start(app: tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        let _ = win::APP.set(app);
        std::thread::spawn(|| unsafe {
            use win::*;
            let class: Vec<u16> = "SW_PowerMonitor\0".encode_utf16().collect();
            let instance = GetModuleHandleW(std::ptr::null());

            let wc = WNDCLASSEXW {
                cb_size: std::mem::size_of::<WNDCLASSEXW>() as u32,
                style: 0,
                lpfn_wnd_proc: wnd_proc,
                cb_cls_extra: 0,
                cb_wnd_extra: 0,
                h_instance: instance,
                h_icon: std::ptr::null_mut(),
                h_cursor: std::ptr::null_mut(),
                h_br_background: std::ptr::null_mut(),
                lpsz_menu_name: std::ptr::null(),
                lpsz_class_name: class.as_ptr(),
                h_icon_sm: std::ptr::null_mut(),
            };
            RegisterClassExW(&wc);

            let title: Vec<u16> = "SW_PowerMonitorWnd\0".encode_utf16().collect();
            // HWND_MESSAGE = (HWND)(LONG_PTR)(-3)
            let hwnd_message = (-3isize as usize) as *mut std::ffi::c_void;

            let hwnd = CreateWindowExW(
                0, class.as_ptr(), title.as_ptr(),
                0, 0, 0, 0, 0,
                hwnd_message,
                std::ptr::null_mut(), instance, std::ptr::null_mut(),
            );
            if hwnd.is_null() {
                return;
            }

            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }
    // non-Windows: no-op
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}
