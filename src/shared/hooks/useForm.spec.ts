import { renderHook, act } from '@testing-library/react-native';
import { useForm } from './useForm';

describe('useForm', () => {
  type FormState = {
    email: string;
    age: number;
  };

  const initialValues: FormState = {
    email: 'user@example.com',
    age: 25,
  };

  const validationRules = {
    email: [
      {
        validate: (val: string) => val.length > 0,
        message: 'E-mail é obrigatório',
      },
      {
        validate: (val: string) => val.includes('@'),
        message: 'E-mail inválido',
      },
    ],
    age: [
      {
        validate: (val: number) => val >= 18,
        message: 'Deve ser maior de idade',
      },
    ],
  };

  it('inicializa o estado do formulário corretamente com valores iniciais', () => {
    const { result } = renderHook(() => useForm(initialValues, validationRules));

    expect(result.current.values).toEqual(initialValues);
    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
    expect(result.current.isSubmitting).toBe(false);
  });

  it('atualiza o valor do campo via handleChange e limpa erro existente do campo', () => {
    const { result } = renderHook(() => useForm(initialValues, validationRules));

    // Define um erro manualmente primeiro
    act(() => {
      result.current.setFieldError('email', 'Erro customizado');
    });

    expect(result.current.errors.email).toBe('Erro customizado');

    // Ao alterar o valor via handleChange, o erro do campo deve ser limpo
    act(() => {
      result.current.handleChange('email', 'novo@example.com');
    });

    expect(result.current.values.email).toBe('novo@example.com');
    expect(result.current.errors.email).toBeUndefined();
  });

  it('marca o campo como tocado via handleBlur', () => {
    const { result } = renderHook(() => useForm(initialValues, validationRules));

    act(() => {
      result.current.handleBlur('email');
    });

    expect(result.current.touched.email).toBe(true);
    expect(result.current.touched.age).toBeUndefined();
  });

  it('valida o formulário com sucesso quando todos os campos passam nas regras', () => {
    const { result } = renderHook(() => useForm(initialValues, validationRules));

    let isValid = false;
    act(() => {
      isValid = result.current.validateForm();
    });

    expect(isValid).toBe(true);
    expect(result.current.errors).toEqual({});
  });

  it('retorna invalido e define mensagens de erro quando as regras falham', () => {
    const invalidValues: FormState = {
      email: 'invalido',
      age: 15,
    };
    const { result } = renderHook(() => useForm(invalidValues, validationRules));

    let isValid = true;
    act(() => {
      isValid = result.current.validateForm();
    });

    expect(isValid).toBe(false);
    expect(result.current.errors.email).toBe('E-mail inválido');
    expect(result.current.errors.age).toBe('Deve ser maior de idade');
  });

  it('retorna valido ao chamar validateForm sem validationRules', () => {
    const { result } = renderHook(() => useForm(initialValues));

    let isValid = false;
    act(() => {
      isValid = result.current.validateForm();
    });

    expect(isValid).toBe(true);
    expect(result.current.errors).toEqual({});
  });

  it('permite definir e alterar estado isSubmitting', () => {
    const { result } = renderHook(() => useForm(initialValues));

    act(() => {
      result.current.setIsSubmitting(true);
    });

    expect(result.current.isSubmitting).toBe(true);
  });

  it('permite definir erro manualmente em um campo via setFieldError', () => {
    const { result } = renderHook(() => useForm(initialValues));

    act(() => {
      result.current.setFieldError('email', 'Erro manual');
    });

    expect(result.current.errors.email).toBe('Erro manual');
  });

  it('reseta um campo individualmente via resetField', () => {
    const { result } = renderHook(() => useForm(initialValues, validationRules));

    act(() => {
      result.current.handleChange('email', 'alterado@example.com');
      result.current.handleBlur('email');
      result.current.setFieldError('email', 'Algum erro');
    });

    expect(result.current.values.email).toBe('alterado@example.com');
    expect(result.current.touched.email).toBe(true);
    expect(result.current.errors.email).toBe('Algum erro');

    act(() => {
      result.current.resetField('email');
    });

    expect(result.current.values.email).toBe(initialValues.email);
    expect(result.current.touched.email).toBe(false);
    expect(result.current.errors.email).toBeUndefined();
    // Garante que outros campos não foram afetados
    expect(result.current.values.age).toBe(25);
  });

  it('reseta todo o formulario via reset', () => {
    const { result } = renderHook(() => useForm(initialValues, validationRules));

    act(() => {
      result.current.handleChange('email', 'alterado@example.com');
      result.current.handleChange('age', 30);
      result.current.handleBlur('email');
      result.current.setIsSubmitting(true);
      result.current.setFieldError('age', 'Erro de idade');
    });

    expect(result.current.values.email).toBe('alterado@example.com');
    expect(result.current.values.age).toBe(30);
    expect(result.current.isSubmitting).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.values).toEqual(initialValues);
    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
    expect(result.current.isSubmitting).toBe(false);
  });
});
