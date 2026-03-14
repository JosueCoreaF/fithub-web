# FitHub Modelos

Este archivo deja una base exportable para los entregables visuales. Puedes abrirlo en un visor compatible con Mermaid y exportarlo a PDF o imagen.

## Modelo Conceptual

```mermaid
flowchart TD
    Persona[Persona\n- id_persona\n- nombre\n- correo\n- direccion\n- fecha_nacimiento]
    Telefono[Telefono\n- telefono]
    Cliente[Cliente\n- fecha_registro]
    Entrenador[Entrenador\n- especialidad\n- estado_laboral]
    Sede[Sede\n- id_sede\n- nombre_sede\n- ubicacion]
    Actividad[Actividad\n- id_actividad\n- nombre_actividad\n- descripcion\n- tipo]
    Programacion[Programacion Actividad\n- id_programacion\n- horario\n- cupo_maximo\n- costo]
    Membresia[Membresia\n- id_membresia\n- tipo_plan\n- fecha_inicio\n- fecha_vencimiento\n- costo\n- estado]
    Reserva[Reserva\n- id_reserva\n- fecha_reserva\n- precio_aplicado\n- estado]
    Pago[Pago\n- id_pago\n- monto\n- fecha_pago\n- metodo_pago\n- referencia]
    Configuracion[Configuracion Operativa\n- id_config\n- ciudad_base\n- horas_anticipacion_reserva\n- umbral_ocupacion]

    Persona -->|tiene| Telefono
    Persona -->|puede ser| Cliente
    Persona -->|puede ser| Entrenador
    Sede -->|ofrece| Programacion
    Actividad -->|se agenda en| Programacion
    Entrenador -->|imparte| Programacion
    Cliente -->|adquiere| Membresia
    Cliente -->|realiza| Reserva
    Programacion -->|recibe| Reserva
    Reserva -->|genera| Pago
    Membresia -->|recibe| Pago
    Configuracion -->|rige| Programacion
```

## Modelo Logico

```mermaid
erDiagram
    PERSONAS ||--o{ PERSONA_TELEFONOS : posee
    PERSONAS ||--o| CLIENTES : asume
    PERSONAS ||--o| ENTRENADORES : asume
    SEDES ||--o{ PROGRAMACION_ACTIVIDADES : contiene
    ACTIVIDADES ||--o{ PROGRAMACION_ACTIVIDADES : define
    ENTRENADORES ||--o{ PROGRAMACION_ACTIVIDADES : imparte
    CLIENTES ||--o{ MEMBRESIAS : adquiere
    CLIENTES ||--o{ RESERVAS : realiza
    PROGRAMACION_ACTIVIDADES ||--o{ RESERVAS : recibe
    RESERVAS ||--o{ PAGOS : liquida
    MEMBRESIAS ||--o{ PAGOS : liquida

    PERSONAS {
      uuid id_persona PK
      text nombre
      text correo UK
      text direccion_ciudad
      text direccion_colonia
      text direccion_calle
      date fecha_nacimiento
    }

    PERSONA_TELEFONOS {
      uuid id_persona FK
      text telefono
    }

    CLIENTES {
      uuid id_persona PK,FK
      date fecha_registro
    }

    ENTRENADORES {
      uuid id_persona PK,FK
      text especialidad
      text estado_laboral
    }

    SEDES {
      uuid id_sede PK
      text nombre_sede UK
      text ubicacion
    }

    ACTIVIDADES {
      uuid id_actividad PK
      text nombre_actividad UK
      text descripcion
      text tipo
    }

    PROGRAMACION_ACTIVIDADES {
      uuid id_programacion PK
      uuid id_sede FK
      uuid id_actividad FK
      uuid id_entrenador FK
      timestamptz horario
      int cupo_maximo
      numeric costo
    }

    MEMBRESIAS {
      uuid id_membresia PK
      uuid id_cliente FK
      text tipo_plan
      date fecha_inicio
      date fecha_vencimiento
      numeric costo
      text estado
    }

    RESERVAS {
      uuid id_reserva PK
      uuid id_cliente FK
      uuid id_programacion FK
      timestamptz fecha_reserva
      numeric precio_aplicado
      text estado
    }

    PAGOS {
      uuid id_pago PK
      numeric monto
      timestamptz fecha_pago
      text metodo_pago
      text referencia
      uuid id_reserva FK
      uuid id_membresia FK
    }
```

## Observaciones de diseño

- Generalizacion: `personas` se especializa en `clientes` y `entrenadores`.
- Entidad asociativa: `reservas` conecta clientes con actividades programadas.
- Atributo compuesto: direccion dividida en ciudad, colonia y calle.
- Atributo multivaluado: `persona_telefonos` modela telefonos separados de `personas`.
- PK compuesta recomendada para entrega final formal: `(id_persona, telefono)` en `persona_telefonos` si deseas enfatizar el multivaluado en la defensa escrita.