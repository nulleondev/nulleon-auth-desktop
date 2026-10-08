use super::*;
use image::{GrayImage, Luma};
const PUBLIC_SECRET: &str = "JBSWY3DPEHPK3PXP"; // Google Key URI public example, not a user key.
const URI: &str = "otpauth://totp/QA:synthetic?secret=JBSWY3DPEHPK3PXP&issuer=QA";
fn qr_image(content: &str, scale: u32) -> GrayImage {
    let code = qrcode::QrCode::new(content).unwrap();
    let size = code.width() as u32;
    let mut image = GrayImage::from_pixel((size + 8) * scale, (size + 8) * scale, Luma([255]));
    for y in 0..size {
        for x in 0..size {
            if code[(x as usize, y as usize)] == qrcode::Color::Dark {
                for dy in 0..scale {
                    for dx in 0..scale {
                        image.put_pixel((x + 4) * scale + dx, (y + 4) * scale + dy, Luma([0]));
                    }
                }
            }
        }
    }
    image
}
#[test]
fn parses_defaults_and_encoded_label() {
    let value = parse_content(
        "otpauth://totp/QA%20Lab%3Aalice%40example.invalid?secret=JBSWY3DPEHPK3PXP&issuer=QA%20Lab",
    )
    .unwrap();
    assert_eq!(value.issuer.as_deref(), Some("QA Lab"));
    assert_eq!(value.account.as_deref(), Some("alice@example.invalid"));
    assert_eq!((value.digits, value.period), (6, 30));
    assert_eq!(value.algorithm, "SHA-1");
}
#[test]
fn preserves_period_digits_and_each_algorithm() {
    for algorithm in ["SHA1", "SHA256", "SHA512"] {
        let value =
            parse_content(&format!("{URI}&algorithm={algorithm}&digits=8&period=60")).unwrap();
        assert_eq!((value.digits, value.period), (8, 60));
        assert_eq!(value.algorithm.replace('-', ""), algorithm);
    }
}
#[test]
fn rejects_wrong_type_and_invalid_parameters() {
    for uri in [
        URI.replace("totp/", "hotp/"),
        format!("{URI}&algorithm=MD5"),
        format!("{URI}&digits=7"),
        format!("{URI}&digits=abc"),
        format!("{URI}&period=0"),
        format!("{URI}&period=301"),
        format!("{URI}&period=abc"),
        format!("{URI}&secret=AAAA"),
        URI.replace("issuer=QA", "issuer=Other"),
        URI.replace("QA:synthetic", ""),
        URI.replace(PUBLIC_SECRET, "ABC=DEF"),
    ] {
        assert!(parse_content(&uri).is_err());
    }
    assert_eq!(
        parse_content("otpauth-migration://offline?data=synthetic").unwrap_err(),
        "QR_MIGRATION_UNSUPPORTED"
    );
}
#[test]
fn raw_secret_and_base32_padding_validation() {
    assert_eq!(
        parse_content("jbsw y3dp ehpk 3pxp").unwrap().secret,
        PUBLIC_SECRET
    );
    for bad in [
        "hello",
        "ABCDEFGHIJKLMNOPQ",
        "JBSWY3DPEHPK3PX=",
        "JBSWY3DPEHPK3PXP=",
        "https://example.invalid",
        "JBSWY3DPEHPK3PX1",
    ] {
        assert!(parse_content(bad).is_err());
    }
}
#[test]
fn real_qr_decoding_scales_rotation_and_inversion() {
    for scale in [2, 4, 8] {
        let image = qr_image(URI, scale);
        for mut variant in [image.clone(), image::imageops::rotate90(&image)] {
            for invert in [false, true] {
                if invert {
                    image::imageops::invert(&mut variant);
                }
                let (values, error) = decode_image(variant.clone());
                let value = select_result(values, error, false).unwrap();
                assert_eq!(value.secret, PUBLIC_SECRET);
            }
        }
    }
}
#[test]
fn rejects_empty_unrelated_and_multiple_codes() {
    assert!(select_result(
        decode_image(GrayImage::from_pixel(600, 400, Luma([255]))).0,
        None,
        false
    )
    .is_err());
    let unrelated = decode_image(qr_image("https://example.invalid", 4));
    assert!(select_result(unrelated.0, unrelated.1, false).is_err());
    let left = qr_image(URI, 4);
    let right = qr_image(&URI.replace("synthetic", "other"), 4);
    let mut both = GrayImage::from_pixel(
        left.width() + right.width() + 20,
        left.height().max(right.height()),
        Luma([255]),
    );
    image::imageops::overlay(&mut both, &left, 0, 0);
    image::imageops::overlay(&mut both, &right, (left.width() + 20) as i64, 0);
    let (values, error) = decode_image(both);
    assert_eq!(
        select_result(values, error, false).unwrap_err(),
        "QR_MULTIPLE"
    );
}
#[test]
fn image_file_import_and_malformed_bytes() {
    let img = image::DynamicImage::ImageLuma8(qr_image(URI, 4));
    for format in [
        image::ImageFormat::Png,
        image::ImageFormat::Jpeg,
    ] {
        let mut bytes = std::io::Cursor::new(Vec::new());
        img.write_to(&mut bytes, format).unwrap();
        assert_eq!(decode_bytes(bytes.get_ref()).unwrap().secret, PUBLIC_SECRET);
    }
    assert_eq!(
        decode_bytes(b"invalid file").unwrap_err(),
        "QR_IMAGE_INVALID"
    );
    assert_eq!(
        decode_bytes(&vec![0; 10 * 1024 * 1024 + 1]).unwrap_err(),
        "QR_IMAGE_INVALID"
    );
}
#[test]
fn capture_failure_and_ambiguous_results_are_not_silent_successes() {
    let value = parse_content(URI).unwrap();
    assert_eq!(
        select_result(vec![value], None, true).unwrap_err(),
        "QR_CAPTURE_FAILED"
    );
}
#[test]
#[ignore = "Run only inside isolated Xvfb displaying the synthetic QR fixture"]
fn capture_real_x11_screen() {
    let result = capture_and_decode().unwrap();
    assert_eq!(result.secret, PUBLIC_SECRET);
    assert_eq!(result.account.as_deref(), Some("synthetic"));
}
#[test]
#[ignore = "Produces only a public synthetic QR fixture for isolated screen testing"]
fn write_screen_fixture() {
    let path = std::env::var("NULLEON_QA_QR_IMAGE").expect("explicit fixture path required");
    qr_image(URI, 7).save(path).unwrap();
}
#[test]
#[ignore = "Run only inside an isolated blank Xvfb display"]
fn capture_blank_x11_screen() {
    assert_eq!(capture_and_decode().unwrap_err(), "QR_NOT_FOUND");
}
#[test]
#[ignore = "Audit only the explicit repository asset list, without printing decoded contents"]
fn publication_images_contain_no_otp_qr() {
    let list = std::env::var("NULLEON_QA_IMAGE_LIST").expect("explicit asset list required");
    let paths = std::fs::read_to_string(list).unwrap();
    for path in paths.lines() {
        let bytes = std::fs::read(path).unwrap();
        assert!(
            decode_bytes(&bytes).is_err(),
            "OTP QR found in repository asset: {path}"
        );
    }
}

#[test]
fn bounded_adversarial_inputs_never_panic() {
    for length in [0, 1, 7, 16, 255, 1024, 8193] {
        for byte in [0u8, 0xff, b'A', b'=', b'%'] {
            let bytes = vec![byte; length];
            assert!(decode_bytes(&bytes).is_err());
            if let Ok(value) = std::str::from_utf8(&bytes) { let _ = parse_content(value); }
        }
    }
    assert!(decode_bytes(&vec![0; 10 * 1024 * 1024 + 1]).is_err());
}
