// Términos y Aviso de Privacidad en español e inglés.
// La versión en inglés es una traducción de cortesía: si hay diferencias, prevalece la versión en español.
const UPDATED_ES = '26 de noviembre de 2026';
const UPDATED_EN = 'November 26, 2026';

const terms = {
  es: (urlOf, WA_DISPLAY, waHref) => `
<span class="eyebrow">Condiciones del servicio</span>
<h1>Términos y Condiciones</h1>
<p class="updated">Última actualización: ${UPDATED_ES}</p>
<p class="lead">Estos términos aplican al servicio de renta de Nissan Urvan que ofrece Turi Express MX y al uso de este sitio web. Al enviar una solicitud de renta, aceptas lo que se describe aquí.</p>

<h2>1. Sobre el servicio</h2>
<p>Turi Express MX, con domicilio en Mérida, Yucatán, ofrece el arrendamiento de vehículos tipo Nissan Urvan para traslados, grupos y viajes de varios días.</p>

<h2>2. Una solicitud no es una reserva confirmada</h2>
<p>Cuando envías el formulario del sitio, <strong>apartamos provisionalmente</strong> las fechas seleccionadas durante unas horas, pero <strong>tu renta todavía no está confirmada</strong>.</p>
<p>La reserva queda confirmada únicamente cuando el personal de Turi Express MX te lo confirma expresamente por WhatsApp, después de validar disponibilidad, precio y condiciones. Si el apartado vence sin confirmación, las fechas se liberan.</p>
<p>Podemos no confirmar una solicitud cuando no se cumplan los requisitos del punto 3, cuando la unidad no esté disponible o cuando los datos proporcionados sean incorrectos o incompletos.</p>

<h2>3. Requisitos para rentar</h2>
<ul>
  <li><strong>Edad mínima:</strong> 25 años cumplidos.</li>
  <li><strong>Licencia de conducir vigente</strong> y válida para el tipo de vehículo.</li>
  <li><strong>Identificación oficial vigente:</strong> INE o pasaporte.</li>
  <li><strong>Depósito en garantía</strong>, reembolsable al devolver la unidad en las condiciones acordadas.</li>
</ul>
<p>Estos documentos se verifican al momento de la entrega. Si no se presentan, la entrega puede cancelarse.</p>

<h2>4. Precio, moneda, depósito y pago</h2>
<p>Los precios que muestra el sitio son <strong>estimados</strong>. La tarifa final, el depósito en garantía y la forma de pago se acuerdan <strong>por WhatsApp antes de confirmar la reserva</strong>.</p>
<p>Todos los cobros se realizan en <strong>pesos mexicanos (MXN)</strong>. El monto en dólares estadounidenses que aparece en el sitio es solo una <strong>referencia aproximada</strong> calculada con un tipo de cambio del día y no constituye un precio en esa moneda.</p>
<p>El depósito se devuelve al término de la renta, una vez revisada la unidad, siempre que se entregue en las mismas condiciones y sin adeudos pendientes (combustible faltante, daños, multas, horas extra, etc.).</p>

<h2>5. Condiciones de uso de la unidad</h2>
<ul>
  <li><strong>Combustible:</strong> se entrega y se debe devolver con el mismo nivel.</li>
  <li><strong>Kilometraje:</strong> libre dentro del área metropolitana. Los viajes fuera de esa zona deben acordarse previamente.</li>
  <li><strong>Entrega y devolución:</strong> fecha, hora y lugar se confirman por WhatsApp. Al entregar y recibir la unidad se hace una revisión con fotografías.</li>
  <li><strong>Conductor:</strong> solo puede conducir la persona registrada en el contrato, salvo autorización expresa por escrito.</li>
  <li>La unidad no puede subarrendarse, usarse para fines ilícitos, ni para remolcar o transportar carga que exceda su capacidad.</li>
</ul>

<h2>6. Responsabilidad del arrendatario</h2>
<ul>
  <li>Daños ocasionados al vehículo por uso indebido, negligencia o incumplimiento de estos términos.</li>
  <li>Multas, infracciones de tránsito y adeudos generados durante la renta.</li>
  <li>Devolver la unidad en la fecha y hora acordadas; las devoluciones tardías pueden generar cargos adicionales.</li>
  <li>Reportar de inmediato cualquier accidente, falla mecánica o incidente.</li>
</ul>
<p>Los detalles de la cobertura de seguro se explican al formalizar la renta.</p>

<h2>7. Cancelaciones y cambios de fecha</h2>
<p>Si necesitas cancelar o mover tus fechas, avísanos por WhatsApp lo antes posible. Las condiciones de cancelación y el tratamiento del depósito se informan al confirmar la reserva.</p>
<p>Turi Express MX podrá cancelar una reserva confirmada por causas de fuerza mayor o fallas mecánicas; en ese caso ofreceremos otra unidad disponible o la devolución de lo pagado.</p>

<h2>8. Uso del sitio web</h2>
<p>Te comprometes a proporcionar información veraz y a no realizar solicitudes falsas o automatizadas que bloqueen la disponibilidad sin intención real de rentar.</p>
<p>El contenido del sitio (textos, imágenes, marca y diseño) es propiedad de Turi Express MX y no puede reproducirse sin autorización.</p>

<h2>9. Datos personales</h2>
<p>Tus datos se tratan conforme a nuestro <a href="${urlOf('privacy', 'es')}">Aviso de Privacidad</a>. No los compartimos con terceros con fines comerciales y los eliminamos 12 meses después de terminada la renta.</p>

<h2>10. Idioma</h2>
<p>Este sitio está disponible en español e inglés. La versión en inglés es una traducción de cortesía; en caso de diferencia, prevalece la versión en español.</p>

<h2>11. Cambios a estos términos</h2>
<p>Podemos actualizar estos términos en cualquier momento. La versión vigente es la publicada en esta página. A tu renta le aplican los términos vigentes cuando se confirma tu reserva.</p>

<h2>12. Legislación aplicable</h2>
<p>Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se someten a los tribunales competentes de Mérida, Yucatán, renunciando a cualquier otro fuero.</p>

<p class="note">¿Alguna duda antes de rentar? Escríbenos por WhatsApp al <a href="${waHref('Hola, tengo una duda sobre los términos de renta.')}" target="_blank" rel="noopener">${WA_DISPLAY}</a>.</p>`,

  en: (urlOf, WA_DISPLAY, waHref) => `
<span class="eyebrow">Rental terms</span>
<h1>Terms and Conditions</h1>
<p class="updated">Last updated: ${UPDATED_EN}</p>
<p class="lead">These terms apply to the Nissan Urvan rental service offered by Turi Express MX and to the use of this website. By sending a rental request, you accept them. This is a courtesy translation; if there is any difference, <a href="${urlOf('terms', 'es')}">the Spanish version</a> prevails.</p>

<h2>1. About the service</h2>
<p>Turi Express MX, based in Mérida, Yucatán, Mexico, rents Nissan Urvan vans for transfers, groups and multi-day trips.</p>

<h2>2. A request is not a confirmed booking</h2>
<p>When you send the form on this site we <strong>temporarily hold</strong> your dates for a few hours, but <strong>your rental is not confirmed yet</strong>.</p>
<p>A booking is confirmed only when Turi Express MX staff expressly confirm it on WhatsApp, after checking availability, price and conditions. If the hold expires without confirmation, the dates are released.</p>
<p>We may decline a request when the requirements in section 3 are not met, the van is not available, or the information provided is incorrect or incomplete.</p>

<h2>3. Rental requirements</h2>
<ul>
  <li><strong>Minimum age:</strong> 25 years.</li>
  <li><strong>A valid driver’s license</strong> for this type of vehicle.</li>
  <li><strong>Valid official ID:</strong> passport or Mexican INE.</li>
  <li><strong>Security deposit</strong>, refunded when the van is returned as agreed.</li>
</ul>
<p>Documents are checked at pick-up. If they are not presented, the rental may be cancelled.</p>

<h2>4. Price, currency, deposit and payment</h2>
<p>Prices shown on the site are <strong>estimates</strong>. The final rate, deposit and payment method are agreed <strong>on WhatsApp before the booking is confirmed</strong>.</p>
<p>All charges are made in <strong>Mexican pesos (MXN)</strong>. The US dollar amount shown on the site is an <strong>approximate reference</strong> based on a daily exchange rate and is not a price in that currency.</p>
<p>The deposit is refunded at the end of the rental after the van is inspected, provided it is returned in the same condition and with no outstanding charges (missing fuel, damage, fines, late hours, etc.).</p>

<h2>5. Use of the van</h2>
<ul>
  <li><strong>Fuel:</strong> the van must be returned with the same fuel level.</li>
  <li><strong>Mileage:</strong> unlimited within the metropolitan area. Trips beyond it must be agreed in advance.</li>
  <li><strong>Pick-up and return:</strong> date, time and place are confirmed on WhatsApp. The van is inspected with photos at pick-up and return.</li>
  <li><strong>Driver:</strong> only the person named in the rental contract may drive, unless authorized in writing.</li>
  <li>The van may not be sublet, used for illegal purposes, or used to tow or carry loads beyond its capacity.</li>
</ul>

<h2>6. Renter’s responsibility</h2>
<ul>
  <li>Damage caused by misuse, negligence or breach of these terms.</li>
  <li>Fines, traffic tickets and charges incurred during the rental.</li>
  <li>Returning the van on the agreed date and time; late returns may incur extra charges.</li>
  <li>Reporting any accident, breakdown or incident immediately.</li>
</ul>
<p>Insurance coverage details are explained when the rental contract is signed.</p>

<h2>7. Cancellations and date changes</h2>
<p>If you need to cancel or change your dates, let us know on WhatsApp as soon as possible. Cancellation conditions and deposit handling are explained when your booking is confirmed.</p>
<p>Turi Express MX may cancel a confirmed booking due to force majeure or mechanical failure; in that case we will offer another available van or refund what you paid.</p>

<h2>8. Use of this website</h2>
<p>You agree to provide truthful information and not to send fake or automated requests that block availability without a real intention to rent.</p>
<p>Site content (text, images, brand and design) belongs to Turi Express MX and may not be reproduced without permission.</p>

<h2>9. Personal data</h2>
<p>Your data is handled according to our <a href="${urlOf('privacy', 'en')}">Privacy Notice</a>. We do not share it with third parties for commercial purposes and we delete it 12 months after the rental ends.</p>

<h2>10. Language</h2>
<p>This site is available in Spanish and English. The English version is a courtesy translation; the Spanish version prevails.</p>

<h2>11. Changes to these terms</h2>
<p>We may update these terms at any time. The current version is the one published on this page. Your rental is governed by the terms in force when your booking is confirmed.</p>

<h2>12. Governing law</h2>
<p>These terms are governed by the laws of Mexico. Any dispute will be submitted to the competent courts of Mérida, Yucatán.</p>

<p class="note">Questions before renting? Message us on WhatsApp at <a href="${waHref('Hi, I have a question about the rental terms.')}" target="_blank" rel="noopener">${WA_DISPLAY}</a>.</p>`,
};

const privacy = {
  es: (urlOf, WA_DISPLAY, waHref) => `
<span class="eyebrow">Protección de datos</span>
<h1>Aviso de Privacidad</h1>
<p class="updated">Última actualización: ${UPDATED_ES}</p>
<p class="lead">Este aviso explica, sin letra chiquita, qué datos recabamos, para qué los usamos, con quién <strong>no</strong> los compartimos y cuándo los borramos.</p>

<h2>1. Responsable</h2>
<p><strong>Turi Express MX</strong>, con domicilio en Mérida, Yucatán, México, es responsable del tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares. Contacto: WhatsApp <a href="${waHref('Hola, tengo una duda sobre el tratamiento de mis datos personales.')}" target="_blank" rel="noopener">${WA_DISPLAY}</a>.</p>

<h2>2. Qué datos recabamos</h2>
<p><strong>En este sitio</strong>, al enviar una solicitud: tu nombre, tu teléfono (WhatsApp) y las fechas que solicitas.</p>
<p><strong>Al formalizar la renta</strong>, en persona: los datos de tu identificación oficial y licencia de conducir, domicilio, tu firma en el contrato y fotografías del estado de la unidad al entregarla y recibirla.</p>
<p>No recabamos datos sensibles ni datos bancarios o de tarjetas a través de este sitio.</p>

<h2>3. Para qué los usamos</h2>
<ul>
  <li>Registrar tu solicitud y apartar la unidad en tus fechas.</li>
  <li>Contactarte por WhatsApp para confirmar disponibilidad, precio y condiciones.</li>
  <li>Elaborar el contrato de renta y documentar el estado de la unidad.</li>
  <li>Llevar el control interno de rentas, pagos y atender aclaraciones.</li>
</ul>
<p><strong>No usamos tus datos para publicidad ni mercadotecnia.</strong></p>

<h2>4. No compartimos tus datos</h2>
<p><strong>No vendemos, rentamos ni compartimos tus datos con terceros con fines comerciales.</strong> Solo intervienen:</p>
<ul>
  <li><strong>Nuestro propio servidor:</strong> el sistema de reservas y su base de datos funcionan en un servidor administrado directamente por Turi Express MX.</li>
  <li><strong>Proveedores técnicos (encargados):</strong> Hostinger aloja las páginas de este sitio y Cloudflare protege la conexión cifrada con el sistema de reservas. Procesan la información solo para prestar ese servicio.</li>
  <li><strong>WhatsApp (Meta):</strong> la conversación para confirmar tu renta se rige además por las políticas de esa plataforma.</li>
  <li><strong>Autoridad competente:</strong> solo si lo requiere formalmente por mandato legal.</li>
</ul>

<h2>5. Cuánto tiempo los conservamos</h2>
<p>Conservamos tus datos durante <strong>12 meses a partir del término de la renta</strong>. Después, el sistema <strong>borra automáticamente</strong> tus datos de contacto, documentos y fotografías. Puedes pedir que los borremos antes (punto 6).</p>

<h2>6. Tus derechos ARCO</h2>
<p>Puedes solicitar el <strong>Acceso</strong>, <strong>Rectificación</strong>, <strong>Cancelación</strong> u <strong>Oposición</strong> al tratamiento de tus datos, así como revocar tu consentimiento. Escríbenos por WhatsApp indicando tu nombre, el teléfono con el que hiciste la solicitud y qué deseas. Respondemos en un máximo de <strong>20 días hábiles</strong>, sin costo. Si no quedas conforme, puedes acudir a la autoridad de protección de datos personales competente.</p>

<h2>7. Cómo protegemos tus datos</h2>
<ul>
  <li>Toda la comunicación viaja cifrada (HTTPS).</li>
  <li>El calendario público solo muestra fechas ocupadas, <strong>nunca nombres ni teléfonos</strong>.</li>
  <li>Solo el personal autorizado, con usuario y contraseña individual, puede consultar los datos de una renta.</li>
  <li>Hacemos respaldos diarios de la información en nuestro propio servidor.</li>
</ul>

<h2>8. Cookies</h2>
<p>Este sitio <strong>no usa cookies de publicidad, analítica ni rastreo</strong>. Las tipografías e imágenes se sirven desde nuestro propio sitio. El tipo de cambio para mostrar dólares lo obtiene nuestro servidor, no tu navegador.</p>

<h2>9. Cambios a este aviso</h2>
<p>Si lo modificamos, publicaremos la versión actualizada en esta página con su nueva fecha.</p>
<p class="note">¿Dudas sobre este aviso? Escríbenos por WhatsApp y con gusto te explicamos.</p>`,

  en: (urlOf, WA_DISPLAY, waHref) => `
<span class="eyebrow">Data protection</span>
<h1>Privacy Notice</h1>
<p class="updated">Last updated: ${UPDATED_EN}</p>
<p class="lead">This notice explains, in plain words, what data we collect, why, who we do <strong>not</strong> share it with, and when we delete it. This is a courtesy translation; if there is any difference, <a href="${urlOf('privacy', 'es')}">the Spanish version</a> prevails.</p>

<h2>1. Data controller</h2>
<p><strong>Turi Express MX</strong>, based in Mérida, Yucatán, Mexico, is responsible for your personal data under Mexico’s Federal Law on the Protection of Personal Data Held by Private Parties. Contact: WhatsApp <a href="${waHref('Hi, I have a question about my personal data.')}" target="_blank" rel="noopener">${WA_DISPLAY}</a>.</p>

<h2>2. What we collect</h2>
<p><strong>On this website</strong>, when you send a request: your name, phone (WhatsApp) and requested dates.</p>
<p><strong>When the rental is formalized</strong>, in person: details from your official ID and driver’s license, address, your signature on the contract, and photos of the van’s condition at pick-up and return.</p>
<p>We do not collect sensitive data or bank/card details through this site.</p>

<h2>3. Why we use it</h2>
<ul>
  <li>To register your request and hold a van for your dates.</li>
  <li>To contact you on WhatsApp to confirm availability, price and conditions.</li>
  <li>To prepare the rental contract and document the van’s condition.</li>
  <li>For internal records of rentals and payments, and to handle questions.</li>
</ul>
<p><strong>We do not use your data for advertising or marketing.</strong></p>

<h2>4. We do not share your data</h2>
<p><strong>We do not sell, rent or share your data with third parties for commercial purposes.</strong> Only these are involved:</p>
<ul>
  <li><strong>Our own server:</strong> the booking system and its database run on a server managed directly by Turi Express MX.</li>
  <li><strong>Technical providers (processors):</strong> Hostinger hosts this website and Cloudflare secures the encrypted connection to the booking system. They process data only to provide that service.</li>
  <li><strong>WhatsApp (Meta):</strong> the conversation to confirm your rental is also subject to that platform’s policies.</li>
  <li><strong>Competent authorities:</strong> only when formally required by law.</li>
</ul>

<h2>5. How long we keep it</h2>
<p>We keep your data for <strong>12 months after the rental ends</strong>. After that, the system <strong>automatically deletes</strong> your contact details, documents and photos. You can ask us to delete them sooner (section 6).</p>

<h2>6. Your rights</h2>
<p>You may request <strong>access</strong>, <strong>correction</strong>, <strong>deletion</strong> or <strong>objection</strong> to the processing of your data, and withdraw your consent. Message us on WhatsApp with your name, the phone used for the request and what you would like us to do. We reply within <strong>20 business days</strong>, free of charge. If you are not satisfied, you may contact the competent Mexican data protection authority.</p>

<h2>7. How we protect it</h2>
<ul>
  <li>All communication is encrypted (HTTPS).</li>
  <li>The public calendar only shows booked dates, <strong>never names or phone numbers</strong>.</li>
  <li>Only authorized staff, each with their own login, can see rental details.</li>
  <li>We make daily backups on our own server.</li>
</ul>

<h2>8. Cookies</h2>
<p>This site <strong>does not use advertising, analytics or tracking cookies</strong>. Fonts and images are served from our own site. The exchange rate used to show US dollars is fetched by our server, not by your browser.</p>

<h2>9. Changes</h2>
<p>If we change this notice, we will publish the updated version on this page with a new date.</p>
<p class="note">Questions about this notice? Message us on WhatsApp and we will gladly explain.</p>`,
};

export const LEGAL = { terms, privacy };
