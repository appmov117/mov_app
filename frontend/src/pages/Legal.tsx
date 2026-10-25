import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

const CONTACT = "mapp8134@gmail.com";
const UPDATED = "25 de octubre de 2026";

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="h-dvh overflow-y-auto bg-surface">
      <article className="mx-auto max-w-2xl px-5 py-8 text-[15px] leading-relaxed text-ink">
        <button type="button" className="text-sm font-semibold underline" onClick={() => navigate(-1)}>
          Volver
        </button>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">Última actualización: {UPDATED}</p>
        <div className="mt-6 space-y-6">{children}</div>
        <p className="mt-10 text-sm text-muted">
          Consulta también el <Link to="/privacidad" className="underline">Aviso de Privacidad</Link> y los{" "}
          <Link to="/terminos" className="underline">Términos y deslinde de responsabilidad</Link>.
        </p>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} className="font-semibold underline">
      {CONTACT}
    </a>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalPage title="Aviso de Privacidad">
      <Section title="Responsable">
        <p>
          Ruta (en adelante, «la Plataforma») es responsable del tratamiento de tus datos personales conforme a la Ley
          Federal de Protección de Datos Personales en Posesión de los Particulares y su normativa aplicable. Para
          cualquier asunto relacionado con tus datos escríbenos a <Mail />.
        </p>
      </Section>
      <Section title="Datos que recabamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Identificación y contacto: nombre, teléfono, correo electrónico y fotografía de perfil.</li>
          <li>Cuenta: contraseña, que guardamos cifrada y nunca en texto legible.</li>
          <li>
            Ubicación: puntos de origen, destino y paradas de tus viajes; en el caso de conductores, su ubicación en
            tiempo real mientras están conectados o en un viaje.
          </li>
          <li>
            Conductores: datos del vehículo (tipo, marca, modelo, año, color y placa), documentos de identificación y del
            vehículo, y comprobantes de pago de la membresía.
          </li>
          <li>Actividad: historial de viajes, tarifas, calificaciones, comentarios, quejas y mensajes del chat del viaje.</li>
          <li>
            Seguridad: alertas de pánico y, solo si tú la activas, la grabación de audio o video del viaje.
          </li>
          <li>Dispositivo: datos técnicos necesarios para enviarte notificaciones.</li>
        </ul>
        <p>No recabamos datos personales sensibles salvo los que tú decidas compartir en grabaciones o mensajes.</p>
      </Section>
      <Section title="Para qué usamos tus datos">
        <p>Finalidades necesarias para el servicio:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Crear y administrar tu cuenta y verificar la identidad de los conductores.</li>
          <li>Conectar pasajeros con conductores cercanos, calcular rutas, tiempos y tarifas.</li>
          <li>Mostrar a cada parte del viaje los datos necesarios del otro (nombre, vehículo, placa y ubicación).</li>
          <li>Gestionar membresías, pagos, referidos, quejas y alertas de seguridad.</li>
          <li>Prevenir fraudes, atender incidentes y cumplir requerimientos de autoridades competentes.</li>
        </ul>
        <p>
          Finalidad secundaria: elaborar estadísticas anónimas para mejorar el servicio. Puedes oponerte a ella
          escribiendo a <Mail /> sin que eso afecte tu uso de la Plataforma.
        </p>
      </Section>
      <Section title="Con quién compartimos tus datos">
        <p>
          Solo con proveedores que nos ayudan a operar la Plataforma (alojamiento y base de datos, mapas y rutas,
          notificaciones y cobro de membresías), bajo obligación de confidencialidad, y con autoridades cuando la ley lo
          exija. No vendemos tus datos personales.
        </p>
      </Section>
      <Section title="Derechos ARCO y revocación">
        <p>
          Puedes acceder a tus datos, rectificarlos, cancelarlos u oponerte a su tratamiento, así como revocar tu
          consentimiento o limitar su uso. Envía tu solicitud a <Mail /> con tu nombre, el teléfono de tu cuenta, una
          identificación y la descripción de lo que pides. Responderemos en un plazo máximo de 20 días hábiles.
        </p>
      </Section>
      <Section title="Conservación y seguridad">
        <p>
          Conservamos tus datos mientras tengas una cuenta activa y durante el tiempo necesario para atender
          aclaraciones, obligaciones legales o incidentes de seguridad. Aplicamos medidas administrativas, técnicas y
          físicas para protegerlos contra daño, pérdida, alteración o acceso no autorizado.
        </p>
      </Section>
      <Section title="Cambios a este aviso">
        <p>
          Publicaremos cualquier cambio en esta misma página e indicaremos la fecha de actualización. Si el cambio es
          relevante, te avisaremos dentro de la aplicación.
        </p>
      </Section>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Términos y deslinde de responsabilidad">
      <Section title="Qué es Ruta">
        <p>
          Ruta es una plataforma tecnológica que pone en contacto a pasajeros con conductores independientes de auto y
          moto. Ruta no presta servicios de transporte, no es empresa de transporte y no tiene relación laboral con los
          conductores: cada conductor ofrece su servicio por cuenta propia y paga una membresía por usar la Plataforma.
        </p>
      </Section>
      <Section title="Tarifas y pagos">
        <p>
          La aplicación muestra una tarifa mínima calculada con la distancia de la ruta. El conductor puede aceptarla o
          proponer un precio mayor, y el pasajero decide si lo acepta. El pago se hace directamente al conductor; Ruta
          no cobra comisión por viaje, no recibe ese dinero y no es responsable de cobros, cambios ni reembolsos entre
          las partes.
        </p>
      </Section>
      <Section title="Responsabilidades del conductor">
        <ul className="list-disc space-y-1 pl-5">
          <li>Contar con licencia de conducir vigente y los permisos que exija la autoridad local.</li>
          <li>
            Mantener su vehículo en buen estado, con placas, tarjeta de circulación y seguro vigentes; en moto, llevar
            casco para él y para el pasajero.
          </li>
          <li>Respetar el reglamento de tránsito y tratar a los pasajeros con respeto.</li>
          <li>Proporcionar información verdadera sobre su identidad y su vehículo.</li>
        </ul>
      </Section>
      <Section title="Responsabilidades del pasajero">
        <ul className="list-disc space-y-1 pl-5">
          <li>Usar el servicio de forma lícita y tratar al conductor con respeto.</li>
          <li>Pagar el precio acordado al terminar el viaje.</li>
          <li>
            En paquetería, no enviar objetos prohibidos, peligrosos o ilícitos; el remitente responde por su contenido.
          </li>
        </ul>
      </Section>
      <Section title="Deslinde de responsabilidad">
        <p>
          En la medida que permita la ley, Ruta no es responsable de los actos u omisiones de conductores o pasajeros,
          ni de accidentes, lesiones, daños, robos, pérdidas de objetos o paquetes, retrasos o cualquier otro perjuicio
          ocurrido durante o con motivo de un viaje. Cualquier reclamación por esos hechos corresponde a la persona que
          los causó y, en su caso, a su aseguradora.
        </p>
        <p>
          Ruta verifica documentos de los conductores, pero no garantiza la conducta de ningún usuario. Los tiempos,
          rutas y tarifas son estimaciones y pueden variar por tráfico u otras condiciones. La Plataforma se ofrece «tal
          cual» y puede presentar fallas o interrupciones temporales.
        </p>
        <p>
          Las herramientas de seguridad (alerta de pánico y grabación) son un apoyo y no sustituyen a los servicios de
          emergencia. En una emergencia llama al 911.
        </p>
      </Section>
      <Section title="Suspensión de cuentas">
        <p>
          Podemos suspender o cancelar cuentas que incumplan estos términos, proporcionen información falsa o pongan en
          riesgo a otros usuarios.
        </p>
      </Section>
      <Section title="Contacto y legislación">
        <p>
          Para dudas, quejas o aclaraciones escribe a <Mail />. Estos términos se rigen por las leyes de los Estados
          Unidos Mexicanos. Al crear una cuenta confirmas que los leíste y los aceptas.
        </p>
      </Section>
    </LegalPage>
  );
}
