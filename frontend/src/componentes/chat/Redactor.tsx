import { useImperativeHandle, useLayoutEffect, useRef, type KeyboardEvent, type Ref } from 'react'
import { Boton } from '../Boton'
import { BotonIcono } from '../BotonIcono'
import estilos from './Redactor.module.css'

export interface PropsRedactor {
  texto: string
  alCambiar(texto: string): void
  alEnviar(texto: string): void
  alDetener(): void
  esperando: boolean
  /** Muestra la insignia "Modo de prueba". */
  demo?: boolean
  placeholder?: string
  /** Para devolver el foco al campo desde fuera. */
  campoRef?: Ref<HTMLTextAreaElement>
}

/** Campo de mensaje con boton de enviar o detener. Compartido por la pantalla Chat y "Pregunte más". */
export function Redactor({
  texto,
  alCambiar,
  alEnviar,
  alDetener,
  esperando,
  demo = false,
  placeholder = 'Escriba su pregunta',
  campoRef,
}: PropsRedactor) {
  const interno = useRef<HTMLTextAreaElement | null>(null)

  // Altura del campo: crece hasta unas cuatro lineas (el tope lo pone el CSS).
  useLayoutEffect(() => {
    const el = interno.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [texto])

  // Deja que quien usa el redactor devuelva el foco al campo.
  useImperativeHandle(campoRef, () => interno.current as HTMLTextAreaElement, [])

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    alEnviar(texto)
  }

  return (
    <div className={estilos.interior}>
      {demo && <span className={estilos.insignia}>Modo de prueba: todavía sin conexión al asistente real</span>}
      <div className={estilos.campoFila}>
        <textarea
          ref={interno}
          className={estilos.campo}
          aria-label="Mensaje"
          placeholder={placeholder}
          rows={1}
          value={texto}
          onChange={(e) => alCambiar(e.target.value)}
          onKeyDown={alTeclear}
        />
        {esperando ? (
          <BotonIcono icono="stop" etiqueta="Detener" variante="relleno" onClick={alDetener} />
        ) : (
          <Boton icono="send" disabled={texto.trim() === ''} onClick={() => alEnviar(texto)}>
            Enviar
          </Boton>
        )}
      </div>
    </div>
  )
}
