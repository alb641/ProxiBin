import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Adminproviders } from './adminproviders';

describe('Adminproviders', () => {
  let component: Adminproviders;
  let fixture: ComponentFixture<Adminproviders>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Adminproviders],
    }).compileComponents();

    fixture = TestBed.createComponent(Adminproviders);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
