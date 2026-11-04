# Accessibility Statement for NoticeSync

NoticeSync is committed to ensuring digital accessibility for all students, educators, and researchers, including people with disabilities. We continually improve the user experience for everyone and apply the relevant digital accessibility standards.

## Conformance Status

NoticeSync targets conformance with the **Web Content Accessibility Guidelines (WCAG) 2.1 Level AA**. These guidelines explain how to make web content more accessible to people with disabilities, and user-friendly for all people.

## Supported Environments & Assistive Technologies

NoticeSync is designed to be compatible with:
- Modern web browsers: Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Edge.
- Screen readers: NVDA, JAWS, VoiceOver, and TalkBack.
- Keyboard-only navigation across all interactive elements (inputs, review cards, modals, buttons).
- Operating system accessibility settings including high contrast modes and reduced motion preferences.

## Measures to Support Accessibility

NoticeSync implements the following measures:
1. **Semantic HTML**: Proper use of landmark elements (`header`, `main`, `nav`, `section`), headings, and ARIA attributes for structured navigation.
2. **Keyboard Accessibility**: All form controls, document uploads, and event review cards are accessible via standard keyboard navigation (`Tab`, `Enter`, `Space`, `Esc`).
3. **Color Contrast & Readability**: Color palettes are tested for high contrast ratios (minimum 4.5:1 for normal text) to assist users with visual impairments.
4. **Motion Sensitivity**: Respects `prefers-reduced-motion` CSS media query, disabling intensive background transitions and animations for users sensitive to motion.
5. **Alternative Text & Labels**: Text alternatives are provided for icons, status indicators, and graphical UI elements.
6. **Error Identification & Recovery**: Form validation errors and processing warnings provide clear, descriptive text messages explaining what went wrong and how to correct it.

## Known Limitations & Considerations

While NoticeSync strives for comprehensive accessibility, some limitations may occur:
- **Scanned Document OCR**: Uploaded PDFs containing low-resolution scanned raster images without embedded OCR text layers may be challenging for screen readers until processed by the system's text extraction engine.
- **Complex Schedule Matrices**: Highly nested or irregular circular tables may require manual review to confirm date associations.

## Feedback & Barrier Reporting

We welcome feedback on the accessibility of NoticeSync. If you encounter accessibility barriers or have suggestions for improvement, please report them to us:
- **GitHub Issues**: Open an issue using our [Bug Report Template](https://github.com/KatkamKoushik/NoticeSync/issues/new?template=bug_report.md) with the label `accessibility`.
- **Repository**: [https://github.com/KatkamKoushik/NoticeSync](https://github.com/KatkamKoushik/NoticeSync)

We aim to acknowledge and address accessibility reports within 5 business days.

